// The lead pipeline: moving a lead along its funnel and converting a won lead
// into a client. Like the other services, this module owns the domain
// invariants, not authorization — a Server Action asserts the actor may touch
// leads (assertCanAccessLeads / assertCanConvertLead) before delegating here.
//
// Two rules shape everything below:
//   - Status only moves along the funnel. There is no "set status to X" entry
//     point an action could call with an arbitrary jump; the pipeline is a
//     fixed graph and every illegal move is rejected by name.
//   - Conversion is a single transaction and idempotent. Creating the client,
//     carrying contact details over, and flipping the lead to CONVERTED either
//     all happen or none do; converting an already-won lead returns the client
//     that already exists rather than minting a duplicate.

import type { Client, Lead, Prisma } from "@prisma/client";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";

type Tx = Prisma.TransactionClient;

// The funnel as an explicit graph. Progress is one step along the enum order
// (NEW → CONTACTED → TRIAL_BOOKED), and a lead may be abandoned to LOST from
// any live stage. CONVERTED is reached only through convertLead, never here,
// because winning a lead has a side effect (a new client) that a bare status
// write must not be able to skip. CONVERTED and LOST are terminal.
const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  [LeadStatus.NEW]: [LeadStatus.CONTACTED, LeadStatus.LOST],
  [LeadStatus.CONTACTED]: [LeadStatus.TRIAL_BOOKED, LeadStatus.LOST],
  [LeadStatus.TRIAL_BOOKED]: [LeadStatus.LOST],
  [LeadStatus.CONVERTED]: [],
  [LeadStatus.LOST]: [],
};

export type CreateLeadInput = {
  name: string;
  phone: string;
  email?: string;
  source: string;
  ownerUserId: string;
};

// Capture a new lead at the top of the funnel. The owner is the actor who took
// it (front desk on the counter, or a manager); status always starts at NEW —
// there is no way to inject a lead mid-pipeline. Audited as a create.
export async function createLead(input: CreateLeadInput): Promise<Lead> {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email || null,
        source: input.source,
        ownerUserId: input.ownerUserId,
        status: LeadStatus.NEW,
      },
    });
    await recordAudit(tx, {
      actorUserId: input.ownerUserId,
      entityType: "Lead",
      entityId: lead.id,
      action: "CREATE_LEAD",
      after: lead,
    });
    return lead;
  });
}

// The legal next moves from a lead's current status, for a UI that renders only
// what the state machine allows rather than every status and letting the server
// reject. CONVERTED is excluded — it is reached through convertLead, never a
// bare status write — so it never appears as a plain transition option.
export function legalLeadTransitions(from: LeadStatus): LeadStatus[] {
  return [...LEAD_TRANSITIONS[from]];
}

// Move a lead one step along the funnel. Rejects any jump the graph does not
// allow and names the attempted transition, so a skipped stage or a backwards
// move fails loudly rather than silently corrupting the pipeline. CONVERTED is
// deliberately not reachable here — use convertLead, which also creates the
// client.
export async function advanceLeadStatus(
  leadId: string,
  to: LeadStatus,
  actorUserId: string,
): Promise<Lead> {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error("Lead not found.");

    if (to === LeadStatus.CONVERTED) {
      throw new Error(
        "Converting a lead goes through convertLead, not a status write.",
      );
    }
    if (!LEAD_TRANSITIONS[lead.status].includes(to)) {
      throw new Error(
        `Illegal lead transition ${lead.status} → ${to}.`,
      );
    }

    const updated = await tx.lead.update({
      where: { id: leadId },
      data: { status: to },
    });
    await recordAudit(tx, {
      actorUserId,
      entityType: "Lead",
      entityId: leadId,
      action: "ADVANCE_LEAD",
      before: lead,
      after: updated,
    });
    return updated;
  });
}

// Convert a won lead into a client in one transaction: create the Client linked
// back via leadId with the lead's contact details copied over, and flip the
// lead to CONVERTED. Only a TRIAL_BOOKED lead may convert — that is the funnel
// stage immediately before CONVERTED, so a lead cannot jump the queue.
//
// Idempotent: converting a lead that is already CONVERTED returns the client
// already linked to it rather than creating a second one. The leadId unique
// constraint on Client is the backstop — even a racing double-convert can only
// leave one client — but the explicit lookup makes the common case a clean
// no-op instead of a caught unique-violation.
export async function convertLead(
  leadId: string,
  actorUserId: string,
): Promise<Client> {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error("Lead not found.");

    if (lead.status === LeadStatus.CONVERTED) {
      const existing = await tx.client.findUnique({ where: { leadId } });
      // A CONVERTED lead always has its client; the constraint guarantees it.
      // No audit row on this path — nothing changed, so there is nothing to log.
      if (existing) return existing;
    }

    if (lead.status !== LeadStatus.TRIAL_BOOKED) {
      throw new Error(
        `Illegal lead transition ${lead.status} → CONVERTED (only TRIAL_BOOKED converts).`,
      );
    }

    return createClientFromLead(tx, lead, actorUserId);
  });
}

// Create the client and mark the lead CONVERTED. Split out so the transaction
// body above reads as intent; the two writes belong together and always run in
// the same tx.
async function createClientFromLead(
  tx: Tx,
  lead: Lead,
  actorUserId: string,
): Promise<Client> {
  const client = await tx.client.create({
    data: {
      leadId: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
    },
  });
  await tx.lead.update({
    where: { id: lead.id },
    data: { status: LeadStatus.CONVERTED },
  });
  // The conversion is one auditable event, keyed to the new client: `before` is
  // null (the client did not exist), `after` is the created client.
  await recordAudit(tx, {
    actorUserId,
    entityType: "Client",
    entityId: client.id,
    action: "CONVERT_LEAD",
    after: client,
  });
  return client;
}
