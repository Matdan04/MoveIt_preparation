"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/session";
import { assertCanManageCoaches } from "@/lib/auth/authz";
import {
  createCoach,
  updateCoach,
  setCoachActive,
  deleteCoach,
} from "@/lib/services/coaches";

export type ActionResult = { ok: true } | { error: string };

// Specialties arrive as one free-text field ("Strength, Mobility"); split on
// commas here so the service only ever sees a clean array.
function parseSpecialties(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const CreateInput = z.object({
  name: z.string().trim().min(1, "Enter a name."),
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters."),
  specialties: z.string(),
  weeklyCapacityHours: z.coerce
    .number()
    .int()
    .min(0, "Capacity cannot be negative.")
    .max(80, "That capacity looks too high."),
});

// Add a coach. Authorization first (manager only), then validate, then delegate
// — the service creates the login and the profile together. A duplicate email
// surfaces as the service's friendly message rather than a raw constraint error.
export async function addCoachAction(
  data: z.input<typeof CreateInput>,
): Promise<ActionResult> {
  const actor = await requireActor();
  assertCanManageCoaches(actor);
  const parsed = CreateInput.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  try {
    await createCoach({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      specialties: parseSpecialties(parsed.data.specialties),
      weeklyCapacityHours: parsed.data.weeklyCapacityHours,
      actorUserId: actor.id,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath("/manage/coaches");
  return { ok: true };
}

const UpdateInput = z.object({
  coachId: z.string().min(1),
  name: z.string().trim().min(1, "Enter a name."),
  specialties: z.string(),
  weeklyCapacityHours: z.coerce.number().int().min(0).max(80),
});

// Edit a coach's profile. The coachId is untrusted input, but manage-coaches is
// an all-or-nothing role gate (a manager may touch every coach), so the role
// assertion is the whole check — there is no per-coach ownership to re-verify,
// unlike a coach-scoped resource. A bad id fails as "not found" in the service.
export async function updateCoachAction(
  data: z.input<typeof UpdateInput>,
): Promise<ActionResult> {
  const actor = await requireActor();
  assertCanManageCoaches(actor);
  const parsed = UpdateInput.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  try {
    await updateCoach({
      coachId: parsed.data.coachId,
      name: parsed.data.name,
      specialties: parseSpecialties(parsed.data.specialties),
      weeklyCapacityHours: parsed.data.weeklyCapacityHours,
      actorUserId: actor.id,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath("/manage/coaches");
  revalidatePath(`/coaches/${parsed.data.coachId}`);
  return { ok: true };
}

const SetActiveInput = z.object({
  coachId: z.string().min(1),
  active: z.boolean(),
});

// Deactivate or reactivate a coach. Deactivation returns a warning when active
// clients would be left without a coach, so the manager can go reassign them.
export type SetActiveResult =
  | { ok: true; warning?: string }
  | { error: string };

export async function setCoachActiveAction(
  data: z.input<typeof SetActiveInput>,
): Promise<SetActiveResult> {
  const actor = await requireActor();
  assertCanManageCoaches(actor);
  const parsed = SetActiveInput.safeParse(data);
  if (!parsed.success) return { error: "That request was malformed." };

  try {
    const { strandedClients } = await setCoachActive(
      parsed.data.coachId,
      parsed.data.active,
      actor.id,
    );
    revalidatePath("/manage/coaches");
    revalidatePath(`/coaches/${parsed.data.coachId}`);
    if (!parsed.data.active && strandedClients > 0) {
      return {
        ok: true,
        warning: `${strandedClients} active client${
          strandedClients === 1 ? "" : "s"
        } still assigned — reassign them from the assignments board.`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

const DeleteInput = z.object({ coachId: z.string().min(1) });

// Permanently remove a coach added by mistake. The service refuses any coach
// with history, so a UI that offers this only for a zero-history coach and the
// server guard agree — but the server is the one that decides.
export async function deleteCoachAction(
  data: z.input<typeof DeleteInput>,
): Promise<ActionResult> {
  const actor = await requireActor();
  assertCanManageCoaches(actor);
  const parsed = DeleteInput.safeParse(data);
  if (!parsed.success) return { error: "That request was malformed." };

  try {
    await deleteCoach(parsed.data.coachId, actor.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath("/manage/coaches");
  return { ok: true };
}
