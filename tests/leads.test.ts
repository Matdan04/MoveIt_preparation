import { describe, it, expect } from "vitest";
import { Role, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { advanceLeadStatus, convertLead } from "@/lib/services/leads";

// The pipeline invariants: status moves one step along the funnel and rejects
// jumps by name; conversion creates one linked client in a transaction and is a
// clean no-op the second time.

async function makeLead(status: LeadStatus = LeadStatus.NEW) {
  const passwordHash = await hashPassword("x");
  const owner = await prisma.user.create({
    data: { email: `fd-${crypto.randomUUID()}@x`, name: "Front Desk", passwordHash, role: Role.FRONT_DESK },
  });
  return prisma.lead.create({
    data: {
      name: "Nurul Ain",
      phone: "+60123456789",
      email: "nurul.ain@example.my",
      source: "walk-in",
      status,
      ownerUserId: owner.id,
    },
  });
}

describe("lead status transitions", () => {
  it("advances a lead one step along the funnel", async () => {
    const lead = await makeLead(LeadStatus.NEW);
    const moved = await advanceLeadStatus(lead.id, LeadStatus.CONTACTED, lead.ownerUserId);
    expect(moved.status).toBe(LeadStatus.CONTACTED);
  });

  it("lets a live lead be marked LOST", async () => {
    const lead = await makeLead(LeadStatus.CONTACTED);
    const moved = await advanceLeadStatus(lead.id, LeadStatus.LOST, lead.ownerUserId);
    expect(moved.status).toBe(LeadStatus.LOST);
  });

  it("rejects a skipped stage and names the transition", async () => {
    const lead = await makeLead(LeadStatus.NEW);
    await expect(
      advanceLeadStatus(lead.id, LeadStatus.TRIAL_BOOKED, lead.ownerUserId),
    ).rejects.toThrow(/NEW → TRIAL_BOOKED/);
  });

  it("rejects a backwards move and names the transition", async () => {
    const lead = await makeLead(LeadStatus.TRIAL_BOOKED);
    await expect(
      advanceLeadStatus(lead.id, LeadStatus.NEW, lead.ownerUserId),
    ).rejects.toThrow(/TRIAL_BOOKED → NEW/);
  });

  it("refuses to reach CONVERTED through a status write", async () => {
    const lead = await makeLead(LeadStatus.TRIAL_BOOKED);
    await expect(
      advanceLeadStatus(lead.id, LeadStatus.CONVERTED, lead.ownerUserId),
    ).rejects.toThrow(/convertLead/);
  });

  it("refuses to move a terminal LOST lead", async () => {
    const lead = await makeLead(LeadStatus.LOST);
    await expect(
      advanceLeadStatus(lead.id, LeadStatus.CONTACTED, lead.ownerUserId),
    ).rejects.toThrow(/LOST → CONTACTED/);
  });
});

describe("lead conversion", () => {
  it("creates a linked client, carries contact details over, and marks the lead CONVERTED", async () => {
    const lead = await makeLead(LeadStatus.TRIAL_BOOKED);

    const client = await convertLead(lead.id, lead.ownerUserId);

    expect(client.leadId).toBe(lead.id);
    expect(client.name).toBe(lead.name);
    expect(client.phone).toBe(lead.phone);
    expect(client.email).toBe(lead.email);

    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.status).toBe(LeadStatus.CONVERTED);
  });

  it("is idempotent: converting again returns the same client, not a duplicate", async () => {
    const lead = await makeLead(LeadStatus.TRIAL_BOOKED);

    const first = await convertLead(lead.id, lead.ownerUserId);
    const second = await convertLead(lead.id, lead.ownerUserId);

    expect(second.id).toBe(first.id);
    const count = await prisma.client.count({ where: { leadId: lead.id } });
    expect(count).toBe(1);
  });

  it("refuses to convert a lead that has not reached TRIAL_BOOKED", async () => {
    const lead = await makeLead(LeadStatus.NEW);
    await expect(convertLead(lead.id, lead.ownerUserId)).rejects.toThrow(/NEW → CONVERTED/);
  });
});
