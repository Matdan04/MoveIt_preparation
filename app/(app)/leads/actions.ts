"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { LeadStatus } from "@prisma/client";
import { requireActor } from "@/lib/auth/session";
import { assertCanAccessLeads, assertCanConvertLead } from "@/lib/auth/authz";
import { getLeadForActor } from "@/lib/data/leads";
import { createLead, advanceLeadStatus, convertLead } from "@/lib/services/leads";

export type ActionResult = { ok: true } | { error: string };

const CreateInput = z.object({
  name: z.string().trim().min(1, "Enter a name."),
  phone: z.string().trim().min(1, "Enter a phone number."),
  email: z.string().trim().email().optional().or(z.literal("")),
  source: z.string().trim().min(1, "Enter a source."),
});

// Capture a lead. Authorization first (front desk or manager), then validate,
// then delegate. The owner is the acting user — the lead belongs to whoever
// took it at the counter.
export async function addLeadAction(
  data: z.input<typeof CreateInput>,
): Promise<ActionResult> {
  const actor = await requireActor();
  assertCanAccessLeads(actor);
  const parsed = CreateInput.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  try {
    await createLead({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || undefined,
      source: parsed.data.source,
      ownerUserId: actor.id,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath("/leads");
  return { ok: true };
}

const AdvanceInput = z.object({
  leadId: z.string().min(1),
  to: z.nativeEnum(LeadStatus),
});

// Move a lead one legal step. The service enforces the state machine; here we
// only prove the actor may touch leads at all and that the lead is real (the
// scoped read turns a forged id into "not found").
export async function advanceLeadAction(
  data: z.input<typeof AdvanceInput>,
): Promise<ActionResult> {
  const actor = await requireActor();
  assertCanAccessLeads(actor);
  const parsed = AdvanceInput.safeParse(data);
  if (!parsed.success) return { error: "That request was malformed." };

  const lead = await getLeadForActor(actor, parsed.data.leadId);
  if (!lead) return { error: "That lead could not be found." };

  try {
    await advanceLeadStatus(lead.id, parsed.data.to, actor.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath("/leads");
  return { ok: true };
}

const ConvertInput = z.object({ leadId: z.string().min(1) });

// Convert a won lead into a client. Returns the new client id so the caller can
// link the success toast straight to the client's page.
export async function convertLeadAction(
  data: z.input<typeof ConvertInput>,
): Promise<{ ok: true; clientId: string } | { error: string }> {
  const actor = await requireActor();
  assertCanConvertLead(actor);
  const parsed = ConvertInput.safeParse(data);
  if (!parsed.success) return { error: "That request was malformed." };

  const lead = await getLeadForActor(actor, parsed.data.leadId);
  if (!lead) return { error: "That lead could not be found." };

  try {
    const client = await convertLead(lead.id, actor.id);
    revalidatePath("/leads");
    return { ok: true, clientId: client.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
