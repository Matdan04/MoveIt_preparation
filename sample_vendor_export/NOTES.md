# Vendor export — what's wrong with it and why

This is a deliberately dirty export resembling a dump from the studio's previous
booking tool. It is the input to the import pipeline (Step 9). Every defect below
is the kind a real front desk produces under daily pressure, not random noise.
Phone numbers overlap the seeded live database (`+60120000100`…`+60120000124`),
so the reconciler has genuine exact matches, probable matches, and true conflicts
to sort out. **Phone normalised to E.164 is the primary match key**; name
similarity is a secondary signal only.

## clients.csv

Columns are the vendor's own (`Member ID`, `Name`, `Mobile`, `Email`, `Joined`,
`Status`). `Member ID` is the vendor's `sourceRowId`.

| Rows | Dirt | Real-world cause |
|---|---|---|
| V1001, V1002, V1003 | **Three records, one person** (`Nurul Ain` / `NURUL AIN B. ` / `nurul.ain`), all the same phone in three formats (`+60120000100`, `0120000100`, `012-000 0100`). Missing/differing emails, trailing whitespace, uppercase. | Front desk couldn't find the existing member (searched by a different spelling), created a new card each visit. Classic duplicate cluster. Normalise phone → all collapse to `+60120000100`, which also matches live client Nurul Ain. |
| V1004 | Clean-ish exact match, but a **trailing space in the email**. | Copy-paste from a chat message. |
| V1005 | Name abbreviated to `Kavitha S.`; phone in local `0` form. | Staff shorthand. Phone still normalises to `+60120000102` (live Kavitha Subramaniam) — exact phone match, name only a weak corroborator. |
| V1006 | Phone written with **internal spaces** `+6012 000 0103`. | Manual typing. Normalises to `+60120000103` (live Ahmad Faizal). |
| V1007 | **No phone at all**, email only. | Instagram lead who only ever gave an email. Name + email match live Emily Watson, but with no phone there is no primary key — a **probable match a human must confirm**, never auto-merged. |
| V1008 | Apostrophe dropped: `James OConnor` vs live `James O'Connor`. | The old tool stripped punctuation. Phone `0120000113` normalises to `+60120000113` and carries the match. |
| V1009 | Phone contains the **letter `O` instead of zero**: `+6012000O115`. | OCR / fat-finger. Fails phone parsing → **unresolvable row**, recorded as a staging error, not fatal, and not matched on name alone. |
| V1010, V1011 | **Genuinely new** people (`+60120000199`, `0120000200`) not in the live DB. Missing emails. | Members the old system had that the new one was never seeded with — these should import as new clients. |
| V1012, V1013 | **Two different names sharing one phone** (`Lim Xin Yi` and `Linda Lim`, both `0120000104`). | A household/shared mobile. Phone is the primary key yet points at two people — a **true conflict** the reconciler must escalate, not merge. V1012 matches live Lim Xin Yi; V1013 does not. |
| V1014 | `Chloe Lim`, status `Inactive`, matches live `+60120000124` (a converted lead). | Status disagreement (live is Active) — surfaces as a field-level difference for the reviewer. |
| V1015 | **Leading whitespace in the name**, formatted phone `+60 12-000 0122`, **missing Joined date**. | Sloppy entry. Normalises to `+60120000122` (live Deepa Ramasamy); empty date must be tolerated, not rejected. |

Also present throughout: **mixed date formats** — `12/03/2024` (DD/MM/YYYY),
`2024-03-12` (ISO), `3/12/2024` (ambiguous), `18-Jan-2024`, `2024/03/01`, and one
empty. The parser has to handle these without silently guessing an American
month/day order.

## bookings.csv

`When` is vendor local time (Asia/Kuala_Lumpur). Attendance is `Y`/`N`/blank.

| Rows | Dirt | Real-world cause |
|---|---|---|
| B2001, B2002 | Same session booked under **both duplicate member cards** (V1001 and V1002) for the same coach, date and time. | The duplicate-client problem leaking into bookings — one real session, two records. After the clients merge, this is one session, not two. |
| B2004 | Adam Lim booked 09:30 while B2001 has him at 09:00 (60 min each) — **overlapping bookings for one coach**. | Double-booking the old tool never prevented. |
| B2005, B2009, B2013 | **Blank attendance on past sessions.** | Coach forgot to mark the register; the old tool never enforced it. These are unmarked past sessions the manager must resolve. |
| B2006, B2008 | Coach strings `Coach Mike` and `Kenny` **match no coach record**. | Former staff, or a casual cover instructor never set up as a user. |
| B2007 | Member `V9999` **does not exist in clients.csv** — an orphan booking. | The client row was deleted but the booking wasn't cascaded. Recorded as an error, not fatal. |

## packages.csv

`Balance Stated` is the vendor's own credit count. These **deliberately disagree**
with what recomputing from the booking history would give — that gap is exactly
what `parallel-check` exists to surface during cutover. Each disagreement has a
story:

| Row | Vendor says | Story behind the gap |
|---|---|---|
| V1001 | 10-pack, **9** remaining | The double-logged session (B2001 **and** B2002) was charged twice in the old tool — vendor over-deducted. Our ledger, after the duplicate merge, deducts once. **Session logged twice.** |
| V1004 | **6** remaining | A late no-show (B2004, `Attended=N`) was **never charged** in the old tool. Recompute charges it, so our balance is lower. **Missed no-show charge.** |
| V1005 | 10-pack, **10** (full) despite attended sessions | Manager gave a **goodwill comp** verbally; staff just reset the counter to full instead of logging an adjustment. No paper trail. **Manual comp not recorded.** |
| V1006, V1007, V1010, V1011, V1012 | Various | Ordinary rows included so the check isn't all discrepancies; V1012 also carries the shared-phone conflict from clients.csv. |
| V1099 | 20-pack, 20 remaining | Package for a member with **no client row and no bookings** — another orphan. |

Note the **package names are inconsistent** with the live catalogue: `10 Session`,
`PT 10 Pack`, `PT10`, `Trial`, `PT10` all mean the seeded `PT 10-Pack` /
`Trial 3-Pack`. Matching packages by fuzzy name is part of the job.

## What the importer must therefore do

- Normalise phones to E.164 before matching; treat name similarity as corroboration only.
- Collapse the Nurul Ain cluster to one person and to one live match.
- Auto-nothing above ambiguity: V1007 (no phone) and V1012/V1013 (shared phone)
  go to a human.
- Record V1009 (bad phone) and B2007/V9999, V1099 (orphans) as staging errors
  without aborting the run.
- Stamp every committed row with `sourceSystem` and `sourceRowId` (the Member/Booking ID)
  so it traces back here, and be idempotent on re-run.
