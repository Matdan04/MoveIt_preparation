# PROMPTS.md — execution playbook

Run these in order against Claude Code, with `CLAUDE.md` at the repo root.
One prompt per session or per clear checkpoint. Do not skip ahead: each step
assumes the previous one is committed and its tests pass.

**Rules for yourself, not for the model:**

- After every step, run the tests and read the diff before committing. If you
  can't explain a file to Elvis, delete it and ask for a simpler version.
- If a step produces more than ~400 lines you didn't ask for, stop and trim.
- Steps 2, 3, 4 and 9 are the interview. Spend your attention there.

---

## Step 0 — Scaffold

```
Read CLAUDE.md fully before doing anything.

Set up the project skeleton only — no domain logic yet:
- Next.js App Router, TypeScript strict, Tailwind, pnpm
- docker-compose.yml with Postgres 16 and a separate test database
- Prisma initialised, pointing at the Docker Postgres
- Vitest configured to run against the test database, with a setup file that
  truncates tables between tests
- package.json scripts: dev, test, typecheck, seed, import, parallel-check
- .env.example, .gitignore
- README.md stub: title and one line only

No models, no routes, no components yet. Show me the tree.
```

Commit: `Scaffold Next.js app with Postgres and test harness.`

---

## Step 1 — Schema and seed

```
Implement the full Prisma schema from CLAUDE.md. Follow the field lists exactly.

Requirements:
- Money as integer sen, never Float or Decimal-as-string
- All DateTime stored UTC
- The partial unique index on CoachAssignment(clientId) where endedAt is null —
  Prisma can't express this, so add a raw SQL statement in the migration
- The auth session model is named AuthSession, distinct from TrainingSession
- No credit balance column anywhere on ClientPackage

Then write prisma/seed.ts creating a realistic Kuala Lumpur studio: 3 coaches,
1 front desk, 1 manager, ~25 clients across lifecycle stages, 8 leads, 3
package types with RM pricing, and about 6 weeks of session history including
no-shows and cancellations.

Explain any modelling decision where you deviated from CLAUDE.md, and why.
```

Commit: `Add domain schema, migration and seed data.`

Check yourself: open the seeded DB and confirm the history looks like a real
studio, not uniform noise.

---

## Step 2 — Auth

```
Implement session-cookie authentication.

- Sessions stored in the AuthSession table, opaque random id, httpOnly +
  secure + sameSite=lax, sliding expiry
- argon2 or bcrypt password hashing
- lib/auth/session.ts exports requireActor(): resolves the cookie, loads the
  user, throws if absent or inactive. It returns a typed Actor { id, role,
  coachId? }
- Login and logout as Server Actions
- middleware.ts redirects unauthenticated requests to /login and does NOTHING
  else — no role checks there

Add a comment at the top of lib/auth/session.ts explaining, in two sentences,
why authorization does not live in middleware.
```

Commit: `Add session-cookie auth with a typed actor guard.`

---

## Step 3 — Data-access layer and the authorization suite

This is the most important step in the project. Give it its own session.

```
Build lib/data/*.ts: the only place in the codebase that touches prisma
directly for domain reads.

- Every exported query takes the Actor as its first argument and scopes itself
  internally — getClientsForActor(actor), getClientForActor(actor, clientId).
  There is no unscoped read.
- A coach requesting a client they aren't assigned to gets null, and the caller
  turns that into notFound(). Never "forbidden" — do not leak existence.
- No caller may pass a filter that widens scope. Make that structurally
  impossible, not merely discouraged, and tell me how you did it.

Then write tests/authz.test.ts covering every row of the capability table in
CLAUDE.md. For each denied capability, call the data function or Server Action
DIRECTLY with a forged id — as if an attacker crafted the request, bypassing
the UI entirely. Assert it fails.

Name the tests as sentences describing the rule. This suite is the first thing
I will show in the interview.
```

Commit: `Scope all data access by actor and cover the policy with direct-call tests.`

Check yourself: comment out one scope check and confirm a test goes red. If
none does, the suite is decorative.

---

## Step 4 — Credit ledger

```
Implement lib/services/credits.ts.

- Balance always derived by summing CreditLedgerEntry rows; never cached,
  never stored
- Implement the credit rules from CLAUDE.md exactly, including the 12-hour
  no-show window
- Append-only: corrections are compensating entries with a required non-empty
  reason. Export no update or delete path at all.
- Every balance-affecting write runs inside prisma.$transaction

Write tests/credits.test.ts: attendance deduction, no-show inside and outside
the window, studio cancellation, client cancellation both sides of the window,
manual adjustment, reversal, and correct balance on an expired package.

Then add one test that fires two concurrent attendance markings on the same
session and asserts a single deduction. Tell me honestly what the current
design guarantees there and what it doesn't — and what you'd need (row lock,
unique constraint, serialisable isolation) to close the gap.
```

Commit: `Add append-only credit ledger with derived balances.`

That last question is bait on purpose. The answer is your best material for the
"production issues" part of the interview — have it ready in your own words.

---

## Step 5 — Session lifecycle

```
Implement lib/services/sessions.ts, wired to the credit ledger.

- Booking validates: client has a package with remaining credits and unexpired
  validity, coach has no overlapping session, scheduledAt is in the future
- Rescheduling preserves the session id and records the change
- Attendance marking is idempotent — marking attended twice must not
  double-deduct
- State transitions are explicit; no free-form status assignment from actions

Tests for each invariant, including the overlapping-booking rejection.
```

Commit: `Add session lifecycle with booking validation and idempotent attendance.`

---

## Step 6 — Leads and conversion

```
Implement lib/services/leads.ts.

- Status transitions follow the enum order; reject invalid jumps and name the
  attempted transition in the error
- Converting a lead creates a Client linked via leadId, carries contact details
  over, marks the lead CONVERTED — all in one transaction
- Conversion is idempotent: converting an already-converted lead returns the
  existing client rather than creating a duplicate

Tests for the transition rules and the idempotent conversion.
```

Commit: `Add lead pipeline and idempotent conversion to client.`

---

## Step 7 — Coach assignment

```
Implement lib/services/assignments.ts.

- Assigning a coach to a client with an active assignment closes the old one
  with endedAt and reason, then opens the new one, in a single transaction
- Assignment history is queryable and ordered
- Respect weeklyCapacityHours: warn (do not block) when an assignment pushes a
  coach over capacity, and surface the number

Tests: reassignment closes exactly one prior assignment, the partial unique
index holds under concurrent reassignment, history reads back in order.
```

Commit: `Add coach assignment with full reassignment history.`

---

## Step 8 — Audit log

```
Wire the audit log into every mutation across all services.

- Prefer one choke point over scattered calls — a Prisma client extension or a
  service-layer helper, whichever you can justify in two sentences
- Record actor, entity type and id, action, before/after JSON
- Redact passwordHash from all snapshots
- The audit write is in the same transaction as the mutation it records

Test that a coach reassignment and a manual credit adjustment each produce
exactly one audit row with the correct actor and a usable diff.

Tell me which approach you chose and what you gave up by choosing it.
```

Commit: `Record all mutations to an audit log within the mutating transaction.`

---

## Step 9 — The import pipeline

Three separate prompts. This is the centrepiece; do not let it be generated in
one shot.

### 9a — Dirty fixtures

```
Create sample_vendor_export/ with clients.csv, bookings.csv and packages.csv
following the dirt specification in CLAUDE.md.

Make the mess realistic rather than random: duplicates of the kind a front desk
actually creates, phone formats reflecting plausible Malaysian entry habits,
and package balances that disagree with booking history in ways that have a
story behind them — a manual comp, a missed no-show charge, a session logged
twice.

Write sample_vendor_export/NOTES.md explaining what dirt is in each file and
what real-world behaviour caused it.
```

### 9b — Staging and reconciliation

```
Implement phases 1 and 2 of the importer as a CLI script under scripts/,
run with tsx. Not a Server Action — and put a comment saying why.

- Staging tables mirror the raw CSV shape; live tables untouched
- Row-level parse errors recorded against the staging row, not fatal
- Normalise phones to E.164 as the primary match key; name similarity is a
  secondary signal only and never sufficient alone
- Produce a ReconciliationReport with three buckets: exact matches, probable
  matches with a confidence score and a human-readable reason, and conflicts
  requiring a decision
- Nothing above ambiguity is auto-merged

Tests against the real fixture files, asserting specific expected matches and
specific expected conflicts by name.
```

### 9c — Commit and parallel check

```
Implement phase 3 and the parallel check.

- Commit applies only approved matches, is idempotent, stamps every written row
  with sourceSystem and sourceRowId
- --dry-run defaults to on; committing requires an explicit flag
- pnpm parallel-check compares computed credit balances against the vendor's
  stated balances and lists every discrepancy with client, our balance, their
  balance, and the ledger entries explaining the gap

Test that the same import run twice produces zero changes on the second run,
and that parallel-check surfaces the seeded discrepancies from 9a.
```

Commit: `Add three-phase vendor import with reconciliation and parallel check.`

---

## Step 10 — UI

```
Build the routes listed in CLAUDE.md as Server Components with Server Actions.

Constraints:
- Every Server Action's first line calls requireActor(), then validates input
  with Zod, then delegates to a service. No exceptions, including reads.
- All data reads go through lib/data/* with the actor passed explicitly
- Conditional rendering is UX only; the server checks regardless
- Never select passwordHash or another user's contact details into component
  props, even if unused — the RSC payload is visible in the browser
- Tailwind, no component library, system font stack, one accent colour

Build /login, /leads, /clients/[id], /today and /manage/assignments first.
Show me those before starting /manage/import and /manage/audit.
```

Commit: `Add server-rendered operational screens.`

---

## Step 11 — Hardening pass

```
Review the whole codebase as if reviewing a stranger's PR before a production
deploy. Report, without fixing anything yet:

- Any Server Action missing an auth check on its first line
- Any data read bypassing lib/data/* and touching prisma directly
- Any sensitive field crossing the RSC boundary into client props
- Any non-idempotent operation that should be idempotent
- Any timestamp rendered in the browser's local timezone rather than MYT
- Business logic leaked into components or actions
- Dead code, unused models, abstractions with a single caller

Order by severity. I'll decide what to fix.
```

Fix only what's worth explaining. Leave the rest and mention it in the README —
knowing your own gaps reads better than pretending there aren't any.

---

## Step 12 — README

Write this one yourself. Use Claude to critique, not to draft:

```
Here is my README draft. Do not rewrite it. Critique it against the eight
requirements in CLAUDE.md: tell me which sections are vague, where I'm claiming
something the code doesn't support, and which of my "open questions for MOVE"
are too generic to be worth asking in an interview.
```

---

## Before the call

Run this last:

```
Read the whole repo. I have 35 minutes with the Head of Tech and no coding
test. Give me:

1. The three files I should open on screen, in order, and the one sentence I
   should say while each is open
2. The five hardest questions someone could ask about this code, with the
   honest answer to each — including where the answer is "I didn't handle that"
3. Which single decision in this repo is most defensible, and which is weakest
```

Read the weak answers out loud until they sound like something you'd say, not
something you memorised.
