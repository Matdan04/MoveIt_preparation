# CLAUDE.md — MOVE Ops Slice

## What this is

A deliberately narrow vertical slice of an internal operations platform for a
private fitness studio. It is **not** a product. It is a demonstration artifact
built for a 35-minute interview conversation, designed to show judgment about
data modelling, access control, and migrating off vendor systems without
disrupting daily operations.

Optimise every decision for **explainability in conversation**, not for feature
count. If a feature cannot be justified in one sentence, cut it.

## The domain

A studio runs on this chain:

```
lead → converted client → coach assignment → package purchase (credits)
     → booked sessions → attended/no-show → outcome notes → renewal
```

Today this lives across several disconnected vendor tools. The migration
problem is the interesting problem: the studio cannot stop taking bookings
while the new system is built.

## Scope

### In scope

1. Data model for the chain above
2. Role-based access enforced on the server, at the data-access boundary
3. Session credit ledger with an audit trail
4. A messy-import reconciliation flow (the centrepiece)
5. A thin UI, just enough to demo the above

### Explicitly out of scope

Do not build these. Note them in the README as conscious omissions.

- Payments, invoicing, tax
- Email/SMS notification delivery
- Calendar sync (Google/Outlook)
- Mobile app or client-facing booking portal
- Multi-tenant / multi-studio support
- Marketing attribution, dashboards beyond one summary view

## Tech constraints

- **Next.js (App Router) + TypeScript, strict mode.** No `any`, no
  `@ts-expect-error` without a comment explaining the escape.
- **Prisma + Postgres.** Postgres locally via Docker — not SQLite. The import
  work depends on real transaction and index behaviour.
- **Auth: hand-rolled session cookies**, `httpOnly` + `secure` + `sameSite=lax`,
  argon2 or bcrypt hashing, sessions in the database. Do not add NextAuth. The
  point is to show you understand the mechanism, and the surface here is small
  enough to own.
- **Server Components + Server Actions.** No separate API layer, no client-side
  data fetching, no React Query.
- Styling: Tailwind, no component library. System font stack, one accent
  colour.
- Tests: **Vitest** against a real Postgres test database. Cover authorization
  and the credit ledger. Skip component and E2E tests entirely.
- Seed data: a realistic Kuala Lumpur studio — RM pricing, Malay/Chinese/Indian
  and expat client names, PT packages and class slots, `Asia/Kuala_Lumpur`
  rendering.
- `docker compose up` for Postgres, `pnpm dev` to run, `pnpm seed` to populate.
  Deployment: Vercel + Neon.

## The security model — read this twice

Every Server Action is a public HTTP endpoint. An attacker can invoke any
action in the bundle directly, with any arguments, regardless of what the UI
renders. Server Components are safer but still must not be trusted to gate
data they pass to children.

Therefore:

1. **Every Server Action begins by resolving the session and authorizing.** No
   exceptions, including read-only actions. An action that does not call the
   auth guard on its first line is a bug.
2. **Authorization lives at the data-access layer**, in `lib/data/*.ts`, not in
   the actions and never in components. Queries take the actor as an explicit
   argument and scope themselves — `getClientsForActor(actor)`, not
   `getClients()` filtered afterwards.
3. **Conditional rendering is a UX affordance, never a security boundary.** The
   README must say this in plain words.
4. **IDs from the client are untrusted.** Validate every action input with Zod,
   then re-check ownership server-side. A coach passing another coach's
   `clientId` must fail on the server even though the UI never offered it.
5. Sensitive fields never cross the RSC boundary. Never select `passwordHash`
   or another user's contact details into a component's props, even if unused —
   the RSC payload is visible in the browser.

Write a test for point 4 that calls the action directly with a forged id. That
test is your best single artifact for this interview.

## Data model (Prisma)

Store all timestamps as `DateTime` in UTC. Render in `Asia/Kuala_Lumpur`.
Money as integer sen, never float.

**User** — id, email (unique), name, passwordHash, role, isActive
**Role** — enum: `FRONT_DESK | COACH | MANAGER`
**Session (auth)** — id, userId, expiresAt, createdAt — name it `AuthSession`
  to avoid colliding with training sessions
**Coach** — id, userId (unique FK), specialties, weeklyCapacityHours, active
**Lead** — id, name, phone, email?, source, status, ownerUserId, createdAt
  - status: `NEW | CONTACTED | TRIAL_BOOKED | CONVERTED | LOST`
**Client** — id, leadId? (unique), name, phone, email?, joinedAt, status
**CoachAssignment** — id, clientId, coachId, startedAt, endedAt?, reason
  - at most one active assignment per client; enforce with a raw-SQL partial
    unique index in a migration, since Prisma cannot express it
**Package** — id, name, sessionCount, priceSen, validityDays
**ClientPackage** — id, clientId, packageId, purchasedAt, expiresAt,
  creditsGranted
**TrainingSession** — id, clientId, coachId, scheduledAt, durationMin, status,
  clientPackageId?
  - status: `SCHEDULED | ATTENDED | NO_SHOW | CANCELLED_BY_CLIENT |
    CANCELLED_BY_STUDIO`
**CreditLedgerEntry** — id, clientPackageId, trainingSessionId?, delta, reason,
  createdByUserId, createdAt
**OutcomeNote** — id, trainingSessionId, coachId, body, createdAt
**AuditLog** — id, actorUserId, entityType, entityId, action, before (Json?),
  after (Json?), createdAt

### Credit rules

Credits are **never** stored as a mutable integer on ClientPackage. The balance
is always the sum of ledger entries. This is the single most important
invariant in the project and you should be ready to explain why.

- Booking a session: no credit movement
- Marking attended: `-1`
- Marking no-show inside 12h of `scheduledAt`: `-1`
- Cancelled by studio: `0`
- Cancelled by client >12h before: `0`
- Manager manual adjustment: any delta, `reason` required, never silent

Reversals are new compensating entries. Never update or delete a ledger row.
All balance-affecting writes run inside `prisma.$transaction`.

## Access control

| Capability | FRONT_DESK | COACH | MANAGER |
|---|---|---|---|
| View/edit leads | ✅ | ❌ | ✅ |
| Convert lead → client | ✅ | ❌ | ✅ |
| View all clients | ✅ | own assigned only | ✅ |
| Book/reschedule sessions | ✅ | own only | ✅ |
| Mark attendance | ❌ | own sessions only | ✅ |
| Write outcome notes | ❌ | own sessions only | ✅ read-only |
| Assign/reassign coach | ❌ | ❌ | ✅ |
| Manual credit adjustment | ❌ | ❌ | ✅ |
| View audit log | ❌ | ❌ | ✅ |
| Run import | ❌ | ❌ | ✅ |

A coach reaching another coach's client gets "not found", not "forbidden" — do
not leak existence. Note this choice in the README.

Do **not** rely on `middleware.ts` for authorization. Use it only to redirect
unauthenticated users to login. Middleware runs before the request reaches the
action and is the wrong layer to make per-resource decisions in; say so in the
README.

## The import / reconciliation flow

This is the part that maps directly to the job. Build it properly.

Ship a `sample_vendor_export/` directory containing deliberately dirty CSVs
resembling an export from an older booking tool:

- `clients.csv` — duplicate people (`Nurul Ain` vs `NURUL AIN B.` vs
  `nurul.ain@…` same phone), phone formats `+60123456789`, `0123456789`,
  `012-345 6789`, missing emails, trailing whitespace, mixed date formats
  (`12/03/2024` vs `2024-03-12`)
- `bookings.csv` — sessions referencing clients not present in clients.csv,
  coach name strings matching no coach record, overlapping bookings for one
  coach, past sessions with no attendance mark
- `packages.csv` — credit balances that disagree with the booking history

Three explicit phases:

1. **Parse & stage** — load into staging tables, never touch live tables.
   Row-level errors are recorded, not fatal.
2. **Match & report** — a reconciliation report: exact matches, probable
   matches with confidence and a human-readable reason, unresolvable
   conflicts. Phone normalised to E.164 is the primary match key; name
   similarity is a secondary signal only, never sufficient alone. **Nothing
   above ambiguity is auto-merged — a human decides.**
3. **Commit** — idempotent. The same file twice changes nothing. Every written
   row carries `sourceSystem` and `sourceRowId` so any record traces back to
   the vendor export.

The importer is a **CLI script** (`pnpm import`, `tsx`), not a Server Action.
Long-running work does not belong in a request cycle and you should say why.
The manager UI reviews and approves the report the script produced.

Also ship `pnpm parallel-check`: compares computed credit balances against the
vendor's stated balances and lists discrepancies. This is what you'd actually
run daily during a real cutover.

## Routes (minimum viable)

```
/login
/leads                     front desk + manager
/clients/[id]              scoped by role
/today                     coach's day view, attendance + notes
/manage/assignments        manager
/manage/import             manager — review report, approve, commit
/manage/audit              manager
```

Plain and legible. Do not spend time on visual design; the point is the model
underneath.

## Build order

Commit at each step with a message describing the decision made.

1. Scaffold, Docker Postgres, Prisma schema, migrations, seed
2. Auth: sessions, login, `requireActor()` guard
3. Data-access layer with actor scoping + the authorization test suite
4. Credit ledger service + its tests
5. Session lifecycle + attendance
6. Leads → client conversion
7. Coach assignment with history
8. Audit log wired into all mutations
9. Import CLI: staging → report → commit
10. `parallel-check`
11. UI routes
12. README

If time runs short, cut UI routes `/manage/import` and `/manage/audit` before
cutting anything in steps 1–10.

## README requirements

The README is a deliverable equal in weight to the code. Answer, in this order,
in plain prose, under two pages:

1. **What this is and is not** — one paragraph, states clearly it's a slice.
2. **The model** — the entity chain, and why the credit ledger is append-only.
3. **Why authorization lives in the data layer** — Server Actions are public
   endpoints; conditional rendering is not security. Point at the forged-id
   test.
4. **What I would build first at MOVE, and why** — argue for a specific first
   slice and name the seam you'd cut.
5. **What I deliberately left out** — with a reason for each.
6. **Failure modes I'd expect in production** — concrete: double-booking under
   concurrent writes, a coach reassigned mid-package, the vendor export schema
   changing without notice, an import committed against stale approvals,
   timestamps rendered in the browser's timezone instead of MYT.
7. **Cutover plan** — how old and new run in parallel: read from vendor, write
   to both, daily `parallel-check`, per-workflow cutover order, rollback
   condition, how long you'd run in parallel and what would make you abort.
8. **Open questions for MOVE** — five or six specific things the demo can't
   answer. This is a strength, not a gap.

No emoji, no badges.

## Style rules

- Business logic in `lib/services/*`; Server Actions stay thin — auth, validate,
  delegate, revalidate
- Zod schema for every action input
- No clever abstractions — the reader has 35 minutes
- Comments explain *why*, never *what*
- Do not generate placeholder or lorem content anywhere
