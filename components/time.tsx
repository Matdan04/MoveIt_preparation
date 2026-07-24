import { cn } from "@/lib/utils";

// A server component on purpose. Timestamps are stored UTC and must render in
// the studio's wall-clock time; formatting here — never in a client component —
// keeps every screen in Asia/Kuala_Lumpur regardless of the viewer's browser
// locale. Browser-local formatting is exactly the timezone bug called out in
// the README's failure modes.
const KL = "Asia/Kuala_Lumpur";

type Preset = "date" | "time" | "datetime";

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
};

export function Time({
  value,
  format = "datetime",
  className,
}: {
  value: Date | string;
  format?: Preset;
  className?: string;
}) {
  const date = typeof value === "string" ? new Date(value) : value;
  const rendered = new Intl.DateTimeFormat("en-GB", {
    timeZone: KL,
    ...presets[format],
  }).format(date);

  return (
    <time dateTime={date.toISOString()} className={cn("font-mono", className)}>
      {rendered}
    </time>
  );
}
