import { CreditRail, type RailEntry } from "@/components/credit-rail";
import { ThemeToggle } from "../theme-toggle";

// Throwaway story page for the credit rail. Renders the component against six
// hand-built ledgers so the states can be eyeballed before the real pages use
// it. Deleted at the end of step 10 (see PROMPTS.md 10d).
//
// A server component: it holds the ledger fixtures and passes server-formatted
// (KL) date labels down, exactly as the real client detail page will — the rail
// itself never formats a date.

// Fixture builders. These stand in for the joined ledger rows the data layer
// will hand the component: raw deltas plus the human labels a tooltip needs.
let seq = 0;
const at = (label: string) => ({
  createdAt: new Date(2026, 2, 1, 9, 0, 0, ++seq),
  dateLabel: label,
});

function grant(count: number): RailEntry {
  return {
    id: `g${++seq}`,
    delta: count,
    reason: "package:GRANT",
    trainingSessionId: null,
    ...at("01 Mar 2026, 09:00"),
    actorName: "Front desk",
  };
}

function attended(n: number): RailEntry {
  return {
    id: `s${++seq}`,
    delta: -1,
    reason: "session:ATTENDED",
    trainingSessionId: `sess-${seq}`,
    ...at(`${String(n).padStart(2, "0")} Mar 2026, 10:00`),
    actorName: "Coach Farah",
    sessionStatus: "ATTENDED",
    sessionLabel: `${String(n).padStart(2, "0")} Mar 2026, 10:00`,
  };
}

function adjustment(delta: number, reason: string): RailEntry {
  return {
    id: `a${++seq}`,
    delta,
    reason,
    trainingSessionId: null,
    ...at("18 Mar 2026, 16:30"),
    actorName: "Manager Aisyah",
  };
}

// A reversal reuses the reversed session's id and posts the inverse delta.
function reversalOf(session: RailEntry, reason: string): RailEntry {
  return {
    id: `r${++seq}`,
    delta: -session.delta,
    reason,
    trainingSessionId: session.trainingSessionId,
    ...at("20 Mar 2026, 11:15"),
    actorName: "Manager Aisyah",
  };
}

const reversedSession = attended(9);

const fixtures: {
  title: string;
  note: string;
  entries: RailEntry[];
  expires?: string;
}[] = [
  {
    title: "Full",
    note: "12 granted, none spent.",
    entries: [grant(12)],
    expires: "14 Sep 2026",
  },
  {
    title: "Half-used",
    note: "Six attended sessions deducted from the left.",
    entries: [grant(12), ...[3, 5, 7, 9, 11, 13].map(attended)],
    expires: "14 Sep 2026",
  },
  {
    title: "Exhausted",
    note: "Every credit consumed; balance zero.",
    entries: [grant(8), ...[2, 4, 6, 8, 10, 12, 14, 16].map(attended)],
    expires: "30 Jun 2026",
  },
  {
    title: "Expired · low",
    note: "Past its validity, two credits left — trailing marks warn.",
    entries: [grant(10), ...[2, 4, 6, 8, 10, 12, 14, 16].map(attended)],
    expires: "10 Feb 2026",
  },
  {
    title: "Manual adjustment",
    note: "Manager comped one credit back and took one by hand (notched).",
    entries: [
      grant(10),
      ...[3, 5, 7, 9].map(attended),
      adjustment(-1, "Charged for equipment damage"),
    ],
    expires: "14 Sep 2026",
  },
  {
    title: "Reversal",
    note: "A wrongly-marked attendance reversed: struck, then restored.",
    entries: [
      grant(10),
      ...[3, 5].map(attended),
      reversedSession,
      reversalOf(reversedSession, "Marked attended in error"),
    ],
    expires: "14 Sep 2026",
  },
];

export default function RailStoryPage() {
  return (
    <main className="mx-auto max-w-[1200px] space-y-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Signature element</p>
          <h1 className="text-2xl font-medium">Credit rail</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            One tick per granted credit, derived from ledger rows — never a
            stored number. Hover or tap any mark for the entry that produced it.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {fixtures.map((f) => (
          <div key={f.title} className="rounded-lg border bg-card p-4">
            <div className="mb-3">
              <p className="text-sm font-medium">{f.title}</p>
              <p className="text-xs text-muted-foreground">{f.note}</p>
            </div>
            <CreditRail entries={f.entries} expiresLabel={f.expires} />
            <div className="mt-4 border-t pt-3">
              <p className="eyebrow mb-2">Compact</p>
              <CreditRail entries={f.entries} variant="compact" />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <p className="eyebrow mb-3">Narrow · 375px</p>
        <div className="w-[343px] rounded-md border border-dashed p-3">
          <CreditRail entries={fixtures[2].entries} expiresLabel="30 Jun 2026" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The full rail wraps rather than shrinking, so every mark keeps a
          tappable target; the compact variant packs tight instead.
        </p>
      </section>
    </main>
  );
}
