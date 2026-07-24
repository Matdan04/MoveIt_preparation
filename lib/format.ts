// Server-side date formatting in the studio's wall-clock time. Every timestamp
// is stored UTC; it is formatted here, on the server, in Asia/Kuala_Lumpur —
// never in a client component, which would render in the viewer's own timezone
// (the bug called out in the README's failure modes). The <Time /> component
// covers JSX; this covers the cases where a plain string is needed — a label
// passed into a client component, a tooltip, a select option.

const KL = "Asia/Kuala_Lumpur";

type Preset = "date" | "time" | "datetime" | "weekday";

const presets: Record<Preset, Intl.DateTimeFormatOptions> = {
  date: { day: "2-digit", month: "short", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit", hour12: false },
  datetime: {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  },
  weekday: { weekday: "short", day: "2-digit", month: "short" },
};

export function formatKL(value: Date | string, preset: Preset = "datetime"): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KL,
    ...presets[preset],
  }).format(date);
}

// The MYT day boundaries for a given instant, expressed in UTC — used to window
// the coach day view. Kuala Lumpur is a fixed UTC+8 with no daylight saving, so
// the offset is a constant; this stays correct without a timezone library.
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

// A <input type="datetime-local"> value ("2026-07-25T14:00") is wall-clock time
// with no zone. The studio always means KL wall time, so we read it as UTC+8
// and shift to the real UTC instant to store. Parsing on the server keeps the
// interpretation off the browser's own timezone.
export function klWallTimeToUtc(local: string): Date | null {
  // Accept "YYYY-MM-DDTHH:mm" (optionally with seconds).
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;
  const asUtc = Date.parse(`${local}Z`);
  if (Number.isNaN(asUtc)) return null;
  return new Date(asUtc - KL_OFFSET_MS);
}

export function klDayWindow(dayStartUtc: Date): { from: Date; to: Date } {
  // Shift into KL local time, floor to midnight, shift back to UTC.
  const local = new Date(dayStartUtc.getTime() + KL_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  const from = new Date(local.getTime() - KL_OFFSET_MS);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}
