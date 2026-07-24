import "dotenv/config";
import { $Enums, type Coach } from "@prisma/client";
import { prisma } from "../lib/db";

// Prisma 7 exposes enum runtime values under the $Enums namespace.
const { Role, LeadStatus, ClientStatus, TrainingSessionStatus } = $Enums;
import { hashPassword } from "../lib/auth/password";

// A realistic Kuala Lumpur studio, seeded deterministically so the history
// reads like a real book of business rather than uniform noise. Run with
// `pnpm seed`. Idempotency is not a goal here — this wipes and repopulates the
// dev database.

// Deterministic PRNG (mulberry32) so re-seeding produces the same studio.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(20260724);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const chance = (p: number): boolean => rng() < p;

const NOW = new Date();

// KL is UTC+8 year-round. Build a UTC instant from a KL wall-clock hour so the
// stored timestamp renders back to the intended local time in Asia/Kuala_Lumpur.
function sessionAt(dayOffset: number, hourKL: number, minute = 0): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hourKL - 8, minute, 0, 0);
  return d;
}
const daysFromNow = (n: number): Date =>
  new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

const PASSWORD = "password";

async function main() {
  // Wipe in FK-safe order. Idempotent enough for a dev seed.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog","OutcomeNote","CreditLedgerEntry","TrainingSession",
      "ClientPackage","CoachAssignment","Client","Lead","Package",
      "Coach","AuthSession","User"
    RESTART IDENTITY CASCADE
  `);

  const passwordHash = await hashPassword(PASSWORD);

  // --- Staff -------------------------------------------------------------
  const manager = await prisma.user.create({
    data: {
      email: "manager@example.com",
      name: "Priya Manickavasagam",
      passwordHash,
      role: Role.MANAGER,
    },
  });

  const frontDesk = await prisma.user.create({
    data: {
      email: "frontdesk@example.com",
      name: "Siti Nurhaliza binti Amran",
      passwordHash,
      role: Role.FRONT_DESK,
    },
  });

  // The primary coach account the interviewer logs in as.
  const coachDefs = [
    {
      email: "coach@example.com",
      name: "Adam Lim Wei Jie",
      specialties: ["Strength", "Powerlifting"],
      weeklyCapacityHours: 25,
    },
    {
      email: "coach2@example.com",
      name: "Farah Aziz",
      specialties: ["Mobility", "Rehab"],
      weeklyCapacityHours: 20,
    },
    {
      email: "coach3@example.com",
      name: "Rajesh Kumar",
      specialties: ["HIIT", "Weight Loss"],
      weeklyCapacityHours: 30,
    },
  ];

  const coaches: Coach[] = [];
  for (const def of coachDefs) {
    const user = await prisma.user.create({
      data: {
        email: def.email,
        name: def.name,
        passwordHash,
        role: Role.COACH,
        coach: {
          create: {
            specialties: def.specialties,
            weeklyCapacityHours: def.weeklyCapacityHours,
          },
        },
      },
      include: { coach: true },
    });
    coaches.push(user.coach!);
  }

  // --- Packages (RM pricing, stored as integer sen) ----------------------
  const trialPack = await prisma.package.create({
    data: {
      name: "Trial 3-Pack",
      sessionCount: 3,
      priceSen: 45_000, // RM 450
      validityDays: 30,
    },
  });
  const tenPack = await prisma.package.create({
    data: {
      name: "PT 10-Pack",
      sessionCount: 10,
      priceSen: 180_000, // RM 1,800
      validityDays: 90,
    },
  });
  const twentyPack = await prisma.package.create({
    data: {
      name: "PT 20-Pack",
      sessionCount: 20,
      priceSen: 340_000, // RM 3,400
      validityDays: 180,
    },
  });

  // --- Clients -----------------------------------------------------------
  // A KL mix: Malay, Chinese, Indian, and expat names.
  const clientNames = [
    "Nurul Ain binti Rahman",
    "Tan Wei Ming",
    "Kavitha Subramaniam",
    "Ahmad Faizal bin Hassan",
    "Lim Xin Yi",
    "Muthu Raj",
    "Sarah Abdullah",
    "Chong Kar Wai",
    "Priya Nair",
    "Mohd Hafiz bin Ismail",
    "Emily Watson",
    "Goh Li Hua",
    "Vimala Devi",
    "James O'Connor",
    "Siti Aishah binti Yusof",
    "Wong Jia Hui",
    "Anand Krishnan",
    "Nor Azman bin Salleh",
    "Rebecca Tan",
    "Daniel Müller",
    "Farhana binti Zainal",
    "Lee Chong Aik",
    "Deepa Ramasamy",
    "Hakim bin Roslan",
    "Chloe Lim",
  ];

  // Phone generator: local KL mobile numbers, all normalised the same way.
  let phoneSeq = 100;
  const nextPhone = () => `+6012${String(phoneSeq++).padStart(7, "0")}`;

  const emailFor = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(".") + "@gmail.com";

  type SeededClient = {
    id: string;
    joinedAt: Date;
    lifecycle: "established" | "new" | "churned";
  };
  const clients: SeededClient[] = [];

  for (let i = 0; i < clientNames.length; i++) {
    const name = clientNames[i];
    // Roughly: 5 churned, 4 brand new, the rest established.
    const lifecycle: SeededClient["lifecycle"] =
      i < 5 ? "churned" : i < 9 ? "new" : "established";

    const joinedAt =
      lifecycle === "churned"
        ? daysFromNow(-200 - Math.floor(rng() * 120))
        : lifecycle === "new"
          ? daysFromNow(-7 - Math.floor(rng() * 10))
          : daysFromNow(-40 - Math.floor(rng() * 120));

    const client = await prisma.client.create({
      data: {
        name,
        phone: nextPhone(),
        email: chance(0.85) ? emailFor(name) : null,
        joinedAt,
        status:
          lifecycle === "churned"
            ? ClientStatus.INACTIVE
            : ClientStatus.ACTIVE,
      },
    });
    clients.push({ id: client.id, joinedAt, lifecycle });
  }

  // --- Leads -------------------------------------------------------------
  // Six open leads plus two already converted (linked back to a client so the
  // lead -> client chain is visible in the seed).
  const openLeads: Array<{ name: string; source: string; status: $Enums.LeadStatus }> =
    [
      { name: "Aiman bin Zulkifli", source: "Instagram", status: LeadStatus.NEW },
      { name: "Michelle Yeoh Sanders", source: "Walk-in", status: LeadStatus.CONTACTED },
      { name: "Bala Subramaniam", source: "Referral", status: LeadStatus.TRIAL_BOOKED },
      { name: "Grace Ong", source: "Google Ads", status: LeadStatus.LOST },
      { name: "Zulkarnain bin Omar", source: "Facebook", status: LeadStatus.NEW },
      { name: "Hannah Lee", source: "Referral", status: LeadStatus.CONTACTED },
    ];

  for (const lead of openLeads) {
    await prisma.lead.create({
      data: {
        name: lead.name,
        phone: nextPhone(),
        email: chance(0.6) ? emailFor(lead.name) : null,
        source: lead.source,
        status: lead.status,
        ownerUserId: frontDesk.id,
      },
    });
  }

  // Two converted leads wired to existing clients (Chloe Lim, Hakim bin Roslan).
  for (const clientName of ["Chloe Lim", "Hakim bin Roslan"]) {
    const seeded = clients[clientNames.indexOf(clientName)];
    const existing = await prisma.client.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    const lead = await prisma.lead.create({
      data: {
        name: existing.name,
        phone: existing.phone,
        email: existing.email,
        source: "Referral",
        status: LeadStatus.CONVERTED,
        ownerUserId: frontDesk.id,
        createdAt: daysFromNow(-60),
      },
    });
    await prisma.client.update({
      where: { id: existing.id },
      data: { leadId: lead.id },
    });
  }

  // --- Coach assignments -------------------------------------------------
  // Active clients get a live assignment (round-robin, weighted so the primary
  // coach carries a visible book). Churned clients get a closed assignment.
  const assignmentReason = "Initial assignment at intake";
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const coach = coaches[i % coaches.length];
    if (c.lifecycle === "churned") {
      await prisma.coachAssignment.create({
        data: {
          clientId: c.id,
          coachId: coach.id,
          startedAt: c.joinedAt,
          endedAt: daysFromNow(-60 - Math.floor(rng() * 60)),
          reason: "Client churned",
        },
      });
    } else {
      await prisma.coachAssignment.create({
        data: {
          clientId: c.id,
          coachId: coach.id,
          startedAt: c.joinedAt,
          reason: assignmentReason,
        },
      });
    }
  }

  // Map each client to its (current or last) coach for session generation.
  const coachForClient = (i: number) => coaches[i % coaches.length];

  // --- Packages purchased, session history, and the credit ledger --------
  // Slot allocator so no coach is ever double-booked in the seed. Overlaps are
  // deliberately left to the messy vendor CSVs in Step 9, not the clean data.
  const takenSlots = new Set<string>();
  function reserveSlot(coachId: string, dayOffset: number, hourKL: number) {
    const key = `${coachId}|${dayOffset}|${hourKL}`;
    if (takenSlots.has(key)) return null;
    takenSlots.add(key);
    return sessionAt(dayOffset, hourKL, 0);
  }

  const bookingHours = [7, 8, 9, 10, 11, 17, 18, 19, 20];

  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const coach = coachForClient(i);

    // Package choice by lifecycle.
    const pkg =
      c.lifecycle === "new"
        ? pick([trialPack, tenPack])
        : c.lifecycle === "churned"
          ? tenPack
          : pick([tenPack, twentyPack]);

    const purchasedAt =
      c.lifecycle === "churned"
        ? new Date(c.joinedAt.getTime() + 2 * 86_400_000)
        : c.lifecycle === "new"
          ? new Date(c.joinedAt.getTime() + 1 * 86_400_000)
          : daysFromNow(-35 - Math.floor(rng() * 20));

    const expiresAt = new Date(
      purchasedAt.getTime() + pkg.validityDays * 86_400_000,
    );

    const clientPackage = await prisma.clientPackage.create({
      data: {
        clientId: c.id,
        packageId: pkg.id,
        purchasedAt,
        expiresAt,
        creditsGranted: pkg.sessionCount,
      },
    });

    // The opening grant is itself a ledger entry, so the live balance is
    // literally the sum of ledger rows — nothing is stored separately.
    await prisma.creditLedgerEntry.create({
      data: {
        clientPackageId: clientPackage.id,
        delta: pkg.sessionCount,
        reason: "package_purchase",
        createdByUserId: frontDesk.id,
        createdAt: purchasedAt,
      },
    });

    // How many sessions to generate and over what window.
    const sessionCount =
      c.lifecycle === "new"
        ? 1 + Math.floor(rng() * 2)
        : c.lifecycle === "churned"
          ? 6 + Math.floor(rng() * 3)
          : 5 + Math.floor(rng() * 5);

    // Window: churned clients trained months ago; others over the last ~6 weeks
    // with a couple of upcoming sessions.
    for (let s = 0; s < sessionCount; s++) {
      let dayOffset: number;
      if (c.lifecycle === "churned") {
        dayOffset = -150 - Math.floor(rng() * 40) + s * 4;
      } else {
        // Spread across -42..+7 days.
        dayOffset = -42 + Math.floor((s / sessionCount) * 49) + Math.floor(rng() * 3);
      }

      let scheduledAt: Date | null = null;
      for (let attempt = 0; attempt < 6 && scheduledAt === null; attempt++) {
        const hour = pick(bookingHours);
        scheduledAt = reserveSlot(coach.id, dayOffset + attempt, hour);
      }
      if (scheduledAt === null) continue;

      const isPast = scheduledAt.getTime() < NOW.getTime();

      // Decide an outcome for past sessions; future stay SCHEDULED.
      let status: $Enums.TrainingSessionStatus;
      if (!isPast) {
        status = TrainingSessionStatus.SCHEDULED;
      } else {
        const roll = rng();
        if (roll < 0.72) status = TrainingSessionStatus.ATTENDED;
        else if (roll < 0.82) status = TrainingSessionStatus.NO_SHOW;
        else if (roll < 0.91)
          status = TrainingSessionStatus.CANCELLED_BY_CLIENT;
        else status = TrainingSessionStatus.CANCELLED_BY_STUDIO;
      }

      const session = await prisma.trainingSession.create({
        data: {
          clientId: c.id,
          coachId: coach.id,
          scheduledAt,
          durationMin: 60,
          status,
          clientPackageId: clientPackage.id,
        },
      });

      // Ledger movements follow the credit rules exactly.
      if (status === TrainingSessionStatus.ATTENDED) {
        await prisma.creditLedgerEntry.create({
          data: {
            clientPackageId: clientPackage.id,
            trainingSessionId: session.id,
            delta: -1,
            reason: "attended",
            createdByUserId: coach.userId,
            createdAt: scheduledAt,
          },
        });
        // An outcome note on most attended sessions.
        if (chance(0.6)) {
          await prisma.outcomeNote.create({
            data: {
              trainingSessionId: session.id,
              coachId: coach.id,
              body: pick([
                "Good session. Progressed squat load, form holding.",
                "Worked mobility and core. Client reports less lower-back pain.",
                "Conditioning block completed. Energy low today, kept volume light.",
                "Deadlift technique session. Cued bracing, big improvement.",
                "Hit a bench PB. Deload planned next week.",
              ]),
              createdAt: scheduledAt,
            },
          });
        }
      } else if (status === TrainingSessionStatus.NO_SHOW) {
        // Seeded no-shows are late (inside 12h): charged one credit.
        await prisma.creditLedgerEntry.create({
          data: {
            clientPackageId: clientPackage.id,
            trainingSessionId: session.id,
            delta: -1,
            reason: "no_show_late",
            createdByUserId: coach.userId,
            createdAt: scheduledAt,
          },
        });
      }
      // Cancellations (either side) move no credits in the seed.
    }
  }

  // --- A couple of manager manual adjustments ----------------------------
  // Goodwill credit for one established client, and a correcting reversal for a
  // credit that should not have been charged. Both carry a reason, never silent.
  const goodwillClient = clients[10];
  const goodwillPkg = await prisma.clientPackage.findFirstOrThrow({
    where: { clientId: goodwillClient.id },
  });
  await prisma.creditLedgerEntry.create({
    data: {
      clientPackageId: goodwillPkg.id,
      delta: 1,
      reason: "Goodwill credit: studio double-booked and had to cancel",
      createdByUserId: manager.id,
      createdAt: daysFromNow(-10),
    },
  });

  const reversalClient = clients[12];
  const reversalPkg = await prisma.clientPackage.findFirstOrThrow({
    where: { clientId: reversalClient.id },
  });
  await prisma.creditLedgerEntry.create({
    data: {
      clientPackageId: reversalPkg.id,
      delta: 1,
      reason: "Reversal: no-show charge disputed and upheld in client's favour",
      createdByUserId: manager.id,
      createdAt: daysFromNow(-5),
    },
  });

  // --- Summary -----------------------------------------------------------
  const counts = {
    users: await prisma.user.count(),
    coaches: await prisma.coach.count(),
    clients: await prisma.client.count(),
    leads: await prisma.lead.count(),
    packages: await prisma.package.count(),
    clientPackages: await prisma.clientPackage.count(),
    sessions: await prisma.trainingSession.count(),
    ledgerEntries: await prisma.creditLedgerEntry.count(),
    outcomeNotes: await prisma.outcomeNote.count(),
  };
  console.log("Seed complete:", counts);
  console.log(
    "Login accounts (password: 'password'): manager@example.com, frontdesk@example.com, coach@example.com",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
