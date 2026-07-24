"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/session";
import { assertCanMarkAttendance, assertCanWriteOutcomeNote } from "@/lib/auth/authz";
import { getSessionForActor } from "@/lib/data/sessions";
import {
  markAttended,
  markNoShow,
  cancelByStudio,
  cancelByClient,
  saveOutcomeNote,
} from "@/lib/services/sessions";

// Every action returns this shape so the client can toast with the action's own
// verb. Errors are surfaced, never swallowed — this app waits for the server.
export type ActionResult = { ok: true } | { error: string };

const OutcomeInput = z.object({
  sessionId: z.string().min(1),
  // Optional note captured alongside the outcome, from the sheet's textarea.
  note: z.string().trim().optional(),
});

// The four outcomes a coach records from the day view. Each resolves the actor,
// re-loads the session through the actor-scoped read (so a coach can only touch
// their own — an out-of-scope id reads as not found), authorizes, then delegates
// to the session service. IDs from the client are never trusted past this point.
type Outcome = "ATTENDED" | "NO_SHOW" | "CANCELLED_BY_STUDIO" | "CANCELLED_BY_CLIENT";

async function recordOutcome(
  outcome: Outcome,
  formOrData: { sessionId: string; note?: string },
): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = OutcomeInput.safeParse(formOrData);
  if (!parsed.success) return { error: "That request was malformed." };

  const session = await getSessionForActor(actor, parsed.data.sessionId);
  if (!session) return { error: "That session could not be found." };

  assertCanMarkAttendance(actor, session.coach.id);

  try {
    switch (outcome) {
      case "ATTENDED":
        await markAttended({ sessionId: session.id, actorUserId: actor.id });
        break;
      case "NO_SHOW":
        await markNoShow({ sessionId: session.id, actorUserId: actor.id });
        break;
      case "CANCELLED_BY_STUDIO":
        await cancelByStudio({ sessionId: session.id, actorUserId: actor.id });
        break;
      case "CANCELLED_BY_CLIENT":
        await cancelByClient({ sessionId: session.id, actorUserId: actor.id });
        break;
    }

    // A note may accompany any outcome; only the owning coach may author one.
    const note = parsed.data.note?.trim();
    if (note) {
      assertCanWriteOutcomeNote(actor, session.coach.id);
      await saveOutcomeNote({
        sessionId: session.id,
        coachId: session.coach.id,
        body: note,
        actorUserId: actor.id,
      });
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/today");
  return { ok: true };
}

export async function markAttendedAction(data: {
  sessionId: string;
  note?: string;
}): Promise<ActionResult> {
  return recordOutcome("ATTENDED", data);
}

export async function markNoShowAction(data: {
  sessionId: string;
  note?: string;
}): Promise<ActionResult> {
  return recordOutcome("NO_SHOW", data);
}

export async function cancelStudioAction(data: {
  sessionId: string;
  note?: string;
}): Promise<ActionResult> {
  return recordOutcome("CANCELLED_BY_STUDIO", data);
}

export async function cancelClientAction(data: {
  sessionId: string;
  note?: string;
}): Promise<ActionResult> {
  return recordOutcome("CANCELLED_BY_CLIENT", data);
}

// Save (or replace) a note without changing the session outcome — used when a
// coach edits a note on an already-settled session.
export async function saveNoteAction(data: {
  sessionId: string;
  note: string;
}): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = z
    .object({ sessionId: z.string().min(1), note: z.string().trim().min(1) })
    .safeParse(data);
  if (!parsed.success) return { error: "A note cannot be empty." };

  const session = await getSessionForActor(actor, parsed.data.sessionId);
  if (!session) return { error: "That session could not be found." };
  assertCanWriteOutcomeNote(actor, session.coach.id);

  try {
    await saveOutcomeNote({
      sessionId: session.id,
      coachId: session.coach.id,
      body: parsed.data.note,
      actorUserId: actor.id,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath("/today");
  return { ok: true };
}
