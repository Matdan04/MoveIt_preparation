"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/session";
import {
  assertCanBookForCoach,
  assertCanManageAssignments,
} from "@/lib/auth/authz";
import { getClientForActor } from "@/lib/data/clients";
import { bookSession } from "@/lib/services/sessions";
import { assignCoach } from "@/lib/services/assignments";
import { klWallTimeToUtc } from "@/lib/format";

export type ActionResult = { ok: true } | { error: string };

const BookInput = z.object({
  clientId: z.string().min(1),
  coachId: z.string().min(1),
  // KL wall-clock time from a datetime-local input; parsed to UTC server-side.
  scheduledAtLocal: z.string().min(1),
  durationMin: z.coerce.number().int().positive().max(480),
});

// Book a session for this client. Authorize the actor may book FOR the chosen
// coach (a coach only for themselves), confirm the client is in scope, then
// delegate — the service owns every booking invariant (future slot, no overlap,
// an eligible package). A forged clientId a coach isn't assigned to reads as
// "not found" from the scoped read.
export async function bookSessionAction(
  data: z.input<typeof BookInput>,
): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = BookInput.safeParse(data);
  if (!parsed.success) return { error: "Check the booking details." };

  assertCanBookForCoach(actor, parsed.data.coachId);

  const client = await getClientForActor(actor, parsed.data.clientId);
  if (!client) return { error: "That client could not be found." };

  const scheduledAt = klWallTimeToUtc(parsed.data.scheduledAtLocal);
  if (!scheduledAt) return { error: "Enter a valid date and time." };

  try {
    await bookSession({
      clientId: client.id,
      coachId: parsed.data.coachId,
      scheduledAt,
      durationMin: parsed.data.durationMin,
      actorUserId: actor.id,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath(`/clients/${client.id}`);
  revalidatePath("/today");
  return { ok: true };
}

const ReassignInput = z.object({
  clientId: z.string().min(1),
  coachId: z.string().min(1),
  reason: z.string().trim().min(1, "A reason is required."),
});

// The reassign result carries an optional capacity warning: a breach is
// surfaced to the manager, never blocked (see assignments service).
export type ReassignResult =
  | { ok: true; warning?: string }
  | { error: string };

// Reassign this client's coach. Manager-only; the reason is recorded on the
// assignment being closed so the history reads as a chain.
export async function reassignCoachAction(
  data: z.input<typeof ReassignInput>,
): Promise<ReassignResult> {
  const actor = await requireActor();
  assertCanManageAssignments(actor);
  const parsed = ReassignInput.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const client = await getClientForActor(actor, parsed.data.clientId);
  if (!client) return { error: "That client could not be found." };

  try {
    const { capacityWarning } = await assignCoach({
      clientId: client.id,
      coachId: parsed.data.coachId,
      actorUserId: actor.id,
      reason: parsed.data.reason,
    });
    revalidatePath(`/clients/${client.id}`);
    revalidatePath("/manage/assignments");
    if (capacityWarning) {
      return {
        ok: true,
        warning: `This coach is now at ${capacityWarning.projectedHours}h against a ${capacityWarning.weeklyCapacityHours}h capacity.`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
