import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession, resolveActor } from "@/lib/auth/session";

// These cover the token -> Actor resolution directly against the database,
// which is where the security-relevant decisions (expiry, inactive accounts)
// are made. The cookie plumbing is a thin wrapper over this and needs a Next
// request context, so it is exercised in the app rather than here.

async function makeUser(overrides: {
  email: string;
  role?: Role;
  isActive?: boolean;
  asCoach?: boolean;
}) {
  return prisma.user.create({
    data: {
      email: overrides.email,
      name: overrides.email,
      passwordHash: await hashPassword("password"),
      role: overrides.role ?? Role.FRONT_DESK,
      isActive: overrides.isActive ?? true,
      coach: overrides.asCoach
        ? { create: { specialties: [], weeklyCapacityHours: 20 } }
        : undefined,
    },
    include: { coach: true },
  });
}

describe("resolveActor", () => {
  it("resolves a live session to the actor with role and no coachId for non-coaches", async () => {
    const user = await makeUser({ email: "fd@x", role: Role.FRONT_DESK });
    const token = await createSession(user.id);

    const actor = await resolveActor(token);

    expect(actor).toEqual({
      id: user.id,
      role: Role.FRONT_DESK,
      coachId: undefined,
    });
  });

  it("includes the coachId for a coach account so the data layer can scope by it", async () => {
    const user = await makeUser({ email: "c@x", role: Role.COACH, asCoach: true });
    const token = await createSession(user.id);

    const actor = await resolveActor(token);

    expect(actor?.coachId).toBe(user.coach!.id);
    expect(actor?.role).toBe(Role.COACH);
  });

  it("returns null for an unknown token", async () => {
    expect(await resolveActor("does-not-exist")).toBeNull();
  });

  it("returns null for an expired session", async () => {
    const user = await makeUser({ email: "exp@x" });
    const token = await createSession(user.id);
    await prisma.authSession.update({
      where: { id: token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await resolveActor(token)).toBeNull();
  });

  it("returns null when the account has been deactivated", async () => {
    const user = await makeUser({ email: "off@x", isActive: false });
    const token = await createSession(user.id);

    expect(await resolveActor(token)).toBeNull();
  });

  it("slides the expiry forward on each successful resolve", async () => {
    const user = await makeUser({ email: "slide@x" });
    const token = await createSession(user.id);

    const before = await prisma.authSession.findUniqueOrThrow({ where: { id: token } });
    await prisma.authSession.update({
      where: { id: token },
      data: { expiresAt: new Date(Date.now() + 60 * 1000) },
    });

    await resolveActor(token);

    const after = await prisma.authSession.findUniqueOrThrow({ where: { id: token } });
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime() - 1);
    // Pushed well past the artificially-shortened 60s window.
    expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60 * 1000);
  });
});
