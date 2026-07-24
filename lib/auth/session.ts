// Authorization does NOT live here or in middleware: middleware runs on the
// Edge before the request reaches an action and cannot make per-resource
// decisions, so it only proves *who* the actor is. *What* that actor may touch
// is decided at the data-access layer (lib/data/*), where every query is
// scoped by the actor this module resolves.

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

// The resolved caller. `coachId` is present only for COACH accounts; the data
// layer uses it to scope a coach to their own clients and sessions.
export type Actor = {
  id: string;
  role: Role;
  coachId?: string;
};

// Sliding window: every successful resolve pushes expiry this far into the
// future, so an active user is never logged out mid-work while an idle session
// still dies.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    // Only require HTTPS in production; dev runs on plain http://localhost.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

// Insert a session row keyed by an opaque, high-entropy token. The token is the
// only thing the cookie carries; nothing about the user is encoded in it.
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.authSession.create({
    data: {
      id: token,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

// Token -> Actor, or null for any reason the caller must not distinguish
// (missing, expired, or a deactivated user). Kept free of cookie access so it
// is unit-testable against the database without a request context.
export async function resolveActor(token: string): Promise<Actor | null> {
  const session = await prisma.authSession.findUnique({
    where: { id: token },
    include: { user: { include: { coach: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const { user } = session;
  if (!user.isActive) return null;

  await prisma.authSession.update({
    where: { id: token },
    data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });

  return { id: user.id, role: user.role, coachId: user.coach?.id };
}

// Create the session and plant the cookie. Called from the login action.
export async function startSession(userId: string): Promise<void> {
  const token = await createSession(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions());
}

// Drop the row and the cookie. Called from the logout action.
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.authSession.deleteMany({ where: { id: token } });
    store.delete(SESSION_COOKIE);
  }
}

// Non-throwing resolve for callers that tolerate an anonymous visitor (e.g. the
// login page redirecting an already-authenticated user away).
export async function getOptionalActor(): Promise<Actor | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const actor = await resolveActor(token);
  if (!actor) return null;

  // Re-plant the cookie to slide the browser-side expiry in step with the DB.
  // Setting a cookie during a Server Component render throws; the DB expiry is
  // already extended and the cookie still has life, so swallowing it is safe.
  try {
    store.set(SESSION_COOKIE, token, cookieOptions());
  } catch {
    // Read-only render context: cookie mutation not permitted here.
  }
  return actor;
}

// The guard every Server Action and protected Server Component calls first.
// Throws for any unauthenticated or deactivated caller; middleware normally
// redirects those first, so a throw here means the session died mid-request.
export async function requireActor(): Promise<Actor> {
  const actor = await getOptionalActor();
  if (!actor) throw new Error("Not authenticated.");
  return actor;
}
