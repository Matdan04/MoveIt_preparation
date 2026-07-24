# UI.md — interface spec

Read alongside `CLAUDE.md`. That file owns the domain and the security model.
This file owns the interface. Where they disagree, `CLAUDE.md` wins.

---

## Who this is for

Three people, on shift, in a studio:

- **Front desk** — laptop, all day, interrupted constantly. Someone is standing
  at the counter while they use it. Speed of entry beats everything.
- **Coach** — phone, between sessions, one hand, possibly sweaty. Needs today's
  list and two taps to mark attendance.
- **Manager** — laptop, reviewing. Needs to see what changed and who changed it.

This is a tool used forty times a day by people who already know it, not a page
someone lands on once. That single fact drives every decision below: density
over whitespace, state over decoration, keyboard over mouse.

**It is not a landing page.** No hero section, no gradient, no feature cards, no
marketing copy anywhere. If a screen looks like it's trying to persuade someone,
it's wrong.

---

## Design direction — "Chalk & Ink"

The reference points are a well-run front desk and a printed session log, not a
SaaS dashboard. Warm paper neutrals, cold ink accent, colour reserved almost
entirely for state.

### Colour

Six values. Define them as CSS variables in `globals.css`, map them onto the
shadcn token names, and derive everything else.

| Role | Light | Dark | Use |
|---|---|---|---|
| Paper | `#F7F5F2` | `#14161F` | page background |
| Surface | `#FFFFFF` | `#1C1F2A` | cards, sidebar, popovers |
| Rule | `#DED8CF` | `#2C303D` | borders, dividers |
| Muted ink | `#6B6862` | `#8D8F9A` | secondary text, labels |
| Ink | `#1A1C24` | `#F2F1EE` | primary text |
| Primary | `#2F3EA8` | `#7C8AE8` | primary actions, focus ring, active nav |

Status colours are a **separate, reserved scale**. They never appear as
decoration, only as meaning:

| State | Light | Dark |
|---|---|---|
| Attended / positive | `#2F7A55` | `#5FB88A` |
| Low credits / warning | `#B77A16` | `#DFA33E` |
| No-show / conflict | `#B3402F` | `#E07A66` |
| Cancelled / inert | muted ink | muted ink |

The accent is indigo specifically **because** green, amber and red are spoken
for. Chrome must never be confusable with state. Say this in the README — it's
a one-sentence answer to "how did you approach the design?" that shows you
thought about the system rather than picked a colour.

### Typography

Two faces, three roles.

- **UI / body — Geist Sans.** Sentence case throughout. No uppercase headings
  except the eyebrow labels below.
- **Data — Geist Mono, tabular figures.** Every number that a person compares
  vertically: times, credit counts, session counts, prices, dates, IDs, audit
  diffs. Columns of numbers must align on the decimal. This is the type
  signature of the app — non-negotiable and immediately visible.
- **Eyebrow labels** — Geist Sans, 11px, `tracking-[0.14em]`, uppercase, muted
  ink. Used for section labels only, never for headings.

Scale: `12 / 13 / 14 / 16 / 20 / 24`. Base body is 14px, not 16 — this is a
dense operational tool. Nothing above 24px anywhere in the app.

Line height 1.45 on body, 1.2 on data.

### Density and shape

- Base spacing unit 4px. Card padding 16px, not 24.
- Table rows 40px tall. Compact but tappable.
- Radius: 6px on controls, 8px on cards. Nothing pill-shaped except badges.
- Borders over shadows. One hairline `Rule` border; shadows only on floating
  layers (popover, dialog, sheet).
- Max content width 1200px, left-aligned within the main area, not centred.

### Motion

Almost none. Transitions on `background-color`, `border-color` and `opacity`
only, 120ms, `ease-out`. The sidebar collapse animates at 180ms. No page
transitions, no scroll reveals, no skeleton shimmer — use a static skeleton.
Respect `prefers-reduced-motion` by disabling the sidebar animation.

### The signature element — the credit rail

The most important invariant in this codebase is that a credit balance is
**derived by summing an append-only ledger**, never stored. Make that visible.

The credit rail is a horizontal run of tick marks, one per granted credit:

```
▍▍▍▍▍▍▍▍░░░░   8 of 12 used · expires 14 Sep
 └ filled = consumed   └ empty = remaining
```

Rules:
- One tick per credit granted, rendered from the ledger, never from a count
- Filled tick = a consumed credit; hovering or tapping shows the ledger entry
  that consumed it — the session, the date, who marked it
- A manual adjustment renders as a **notched** tick in the warning colour, with
  the manager's stated reason in the tooltip. Adjustments are visibly different
  from ordinary consumption. That is the whole point.
- A reversal renders as a struck tick followed by a restored empty one — the
  history is shown, never rewritten
- Below the rail: `{used} of {granted} used · expires {date}`, mono figures
- Under 3 remaining, the trailing ticks turn warning-coloured

Build this as `components/credit-rail.tsx`. It appears on the client detail page
and, in a compact 1-line variant, in the client list. Spend your design effort
here and keep everything around it quiet.

---

## App shell

Build with the shadcn `sidebar` block: `pnpm dlx shadcn@latest add sidebar`.
Use the collapsible-to-icon variant (`collapsible="icon"`).

```
┌──────────┬────────────────────────────────────────────┐
│ MOVE   ⌘ │  Breadcrumb / page title      [actions]    │  ← header, 52px
│          ├────────────────────────────────────────────┤
│ ▸ Today  │                                            │
│ ▸ Leads  │  page content                              │
│ ▸ Clients│                                            │
│          │                                            │
│ MANAGE   │                                            │
│ ▸ Coaches│                                            │
│ ▸ Import │                                            │
│ ▸ Audit  │                                            │
│          │                                            │
│ ─────────│                                            │
│ ◐ Theme  │                                            │
│ ⬤ Aisyah │                                            │
└──────────┴────────────────────────────────────────────┘
```

### Sidebar

- **Header**: wordmark `MOVE` in Geist Sans medium, plus the studio name in
  muted ink beneath. Collapses to a monogram.
- **Groups**: an unlabelled primary group, then a `MANAGE` eyebrow group shown
  only to managers.
- **Items** are role-filtered. This is UX only — every page and action still
  authorizes server-side. Put a comment in the nav config saying exactly that,
  so a reviewer reading this file first isn't misled.

| Item | Icon | Roles |
|---|---|---|
| Today | `CalendarDays` | coach, manager |
| Leads | `UserPlus` | front desk, manager |
| Clients | `Users` | all (scoped) |
| Coaches | `Dumbbell` | manager |
| Import | `FileInput` | manager |
| Audit | `ScrollText` | manager |

Icons from `lucide-react`, 16px, `stroke-width={1.75}`. Active item: `Surface`
background, 2px `Primary` left rule, ink text. Never fill the whole item with
the accent colour.

- **Collapse**: rail toggle plus `⌘B`. Persist the state in a cookie so the
  server renders the correct width on first paint — no layout shift. This is a
  small thing that a Head of Tech will notice.
- **Footer**: theme toggle, then the user menu.

### Theme toggle

`next-themes` with `attribute="class"`, `defaultTheme="system"`,
`disableTransitionOnChange`. A three-way segmented control in the sidebar
footer — Light / System / Dark — rendered as icons when collapsed. Add
`suppressHydrationWarning` on `<html>`. Both themes must be genuinely designed,
not an inverted afterthought: check every status colour for contrast in dark
mode.

### User menu

Avatar with initials, name, and role badge. `DropdownMenu` containing:

- The signed-in email, muted, non-interactive
- Theme submenu (duplicate of the toggle, for keyboard users)
- **Log out** — a form posting to a Server Action that destroys the AuthSession
  row and clears the cookie, then redirects to `/login`. Destructive-coloured
  text. Not a link, not a client-side call.

### Header

52px, hairline bottom border. Breadcrumb on the left, page-level actions on the
right. Sticky. No search unless a page needs one.

---

## Shared components

Add these once, use everywhere. `pnpm dlx shadcn@latest add` each:

```
sidebar  button  input  label  form  select  dialog  sheet  dropdown-menu
table  badge  card  tabs  tooltip  popover  calendar  separator  avatar
skeleton  sonner  alert  alert-dialog  scroll-area  command  textarea
switch  checkbox  radio-group  breadcrumb  progress
```

Then build these app-level components on top:

- `<CreditRail />` — the signature, above
- `<StatusBadge status={...} />` — the single place session and lead status map
  to colour and label. One import, one source of truth.
- `<PageHeader title description actions />`
- `<DataTable />` — thin wrapper: sticky header, 40px rows, zebra-free, hairline
  row borders, right-aligned mono numeric columns
- `<EmptyState icon title description action />`
- `<Money sen={...} />` — formats integer sen as `RM 1,200.00`, mono, tabular
- `<Time value />` — renders UTC in `Asia/Kuala_Lumpur`, **formatted on the
  server**. Never format dates in a client component; browser-local formatting
  is exactly the timezone bug in the README's failure-modes list.
- `<RoleGate role>` — convenience only, with a comment: not a security boundary.

Toasts via `sonner`, mounted once in the root layout. Every mutation confirms
with a toast that reuses the action's own verb: the button says *Mark attended*,
the toast says *Marked attended*.

---

## Pages

### `/login`

Single centred card, max 380px, on the paper background. Wordmark above.
Email, password, one primary button reading **Sign in**. Errors render inline
above the fields, in the interface's voice: *That email and password don't
match.* Never *Invalid credentials*, never an apology, and never disclose
whether the email exists.

Below the card, in muted 12px: three demo accounts with role labels and their
password, so an interviewer can click through in ten seconds. Guard it behind
`NODE_ENV !== 'production'`.

### `/today` — coach day view

The screen a coach uses most. Design for a phone first, then let it widen.

- Date strip across the top: yesterday, **today**, tomorrow. Today is default.
- A vertical list of the actor's sessions, ordered by time. Each row:
  - Time in mono, 16px, left, fixed width
  - Client name, and beneath it the compact credit rail
  - Status badge on the right
  - Rows for past sessions still marked `SCHEDULED` carry a warning left rule —
    the coach owes an attendance mark. This is the page's real job.
- Tapping a row opens a `Sheet` (not a dialog — thumb reach): **Mark attended**,
  **No-show**, **Cancel**, and a textarea for the outcome note.
- The no-show button shows, in muted text beneath it, whether the 12-hour window
  applies: *Within 12 hours — this will use a credit.* The rule is surfaced at
  the moment it bites, never hidden in a policy doc.
- Empty state: *No sessions today.* with a secondary link to tomorrow.
- Managers viewing this page get a coach `Select` in the header.

### `/leads`

Front desk speed screen.

- Status `Tabs` across the top with counts in mono: `New 4 · Contacted 7 · …`
- Table: name, phone (mono), source, owner, age in days (mono, warning past 7)
- Row click opens a detail sheet: contact fields, status transition control,
  and a **Convert to client** button
- The status control only offers *legal* next transitions, per the service
  layer. Do not render every status and let the server reject it — the UI should
  make the state machine legible.
- Conversion opens an `AlertDialog` summarising what will happen, then, on
  success, toasts *Converted* with a link to the new client
- Primary header action: **Add lead**, in a dialog
- Empty state per tab: *No new leads.* / *Nothing contacted yet.*

### `/clients` and `/clients/[id]`

The list is scoped by actor — a coach sees only their assigned clients, and the
page says so in a muted line under the title: *Showing your assigned clients.*
Honest about scope rather than pretending the list is everything.

List columns: name, coach, credit rail (compact), next session, status.

Detail page:

- Header: name, status badge, phone/email, primary action **Book session**
- Left column, two-thirds:
  - **Packages** — a credit rail per active package, expired ones collapsed
  - **Sessions** — table, most recent first, mono times, status badges, outcome
    note preview truncated to one line, expandable
- Right column, one-third:
  - **Coach** — current coach, avatar, since date. Managers get **Reassign**,
    which opens a dialog requiring a reason before the confirm button enables.
  - **Assignment history** — a quiet vertical list of past coaches with date
    ranges. Reassignment history is a real product feature; show it.
- Coaches see notes and sessions but not lead source or manual adjustments.

### `/manage/assignments`

Two-pane. Left: coaches, each with a capacity meter — assigned hours against
`weeklyCapacityHours`, using `progress`, amber past 100% and **not blocking**.
Right: the selected coach's clients. Reassigning opens the same dialog as above.
Show the capacity number as text next to the bar; a bar alone can't be read
precisely.

### `/manage/import`

The centrepiece screen. The CLI produces the report; this page reviews it.

- Top: the run summary as four plain stat blocks — rows parsed, exact matches,
  needs review, conflicts. Mono figures, no cards-with-icons, no sparklines.
- `Tabs`: **Needs review** (default) / Exact / Conflicts / Errors
- Needs review is a decision queue, one item at a time, not a table:

```
┌──────────────────────────┬──────────────────────────┐
│ FROM VENDOR EXPORT       │ EXISTING CLIENT          │
│ NURUL AIN B.             │ Nurul Ain                │
│ 012-345 6789             │ +60123456789        ✓    │
│ —                        │ nurul.ain@…              │
│ joined 12/03/2024        │ joined 12 Mar 2024   ✓   │
├──────────────────────────┴──────────────────────────┤
│ Matched on normalised phone · confidence 0.94       │
│              [ Not a match ]  [ Merge into client ] │
└─────────────────────────────────────────────────────┘
```

  Matching fields carry a check in the positive colour; differing fields are
  left plain — do not paint the whole row green.
- The confidence line always states **why** in words, never a bare number.
- Conflicts are read-only with an explanation of what a human must resolve
  outside the system first.
- A sticky footer bar: `12 of 34 reviewed`, and **Commit approved matches**,
  disabled until the queue is clear. The commit dialog restates the counts and
  requires typing `COMMIT`. Destructive, irreversible, guarded — and worth
  saying out loud in the interview that you guarded it.
- Keyboard: `A` approve, `R` reject, `→` skip. Show the hints inline in muted
  text. A front desk clearing 200 rows will thank you.

### `/manage/audit`

- Filter row: entity type, actor, date range. Filters live in the URL so a
  manager can send a colleague a link to exactly what they're looking at.
- Table: timestamp (mono), actor with role badge, action, entity
- Row expands to a two-column before/after diff, mono, with changed keys marked
  and unchanged keys collapsed behind *Show unchanged*
- `passwordHash` never appears — the redaction happens server-side and the UI
  shows nothing at all, not a masked placeholder

---

## States — build all four for every page

1. **Loading** — `loading.tsx` per route with a static skeleton matching the
   real layout's shape. No shimmer.
2. **Empty** — a sentence saying what would appear here and one action that
   creates it. Never *No data*.
3. **Error** — `error.tsx` per route. Say what failed and offer retry. The
   interface's voice, not an apology, never a stack trace.
4. **Forbidden** — the actor reached something outside their scope. For another
   coach's client this is `notFound()`, deliberately, because existence is
   itself information. Comment the call site.

---

## Quality floor

Not features — the baseline. Do not announce these in the UI.

- Responsive to 375px. `/today` is genuinely usable one-handed; tables become
  stacked cards below `md`.
- Visible focus ring on every interactive element, `Primary` at 2px offset.
  Never `outline: none` without a replacement.
- Full keyboard path: sidebar, tables, sheets, and the import queue. Dialogs
  trap focus and restore it on close.
- Every icon-only button has an `aria-label`. Status is never conveyed by colour
  alone — badges carry text.
- `prefers-reduced-motion` disables the sidebar animation.
- Both themes checked at 4.5:1 for body text and 3:1 for large text and borders.
  Check the status colours specifically; they're the ones that fail in dark
  mode.

---

## What not to build

Cutting these is a decision you can defend, not a gap:

- Charts, analytics, KPI tiles. There is no dashboard.
- Drag-and-drop anything.
- A command palette. Tempting, not load-bearing.
- Optimistic UI. Every mutation waits for the server. Say why: this app moves
  money-equivalent credits, and a rolled-back optimistic update is worse than
  400ms of latency.
- Animated page transitions, marketing copy, an onboarding tour, a settings
  page.
