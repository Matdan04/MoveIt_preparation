import type {
  TrainingSessionStatus,
  LeadStatus,
  ClientStatus,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// The single place a status enum maps to a colour and a human label. Status
// tones come from the reserved status scale (positive / warning / danger /
// inert), never from chrome — a green badge can never be confused with the
// indigo accent. The label always carries text so meaning survives without
// colour.
type Tone = "positive" | "warning" | "danger" | "inert";
type Status = TrainingSessionStatus | LeadStatus | ClientStatus;

const config: Record<Status, { label: string; tone: Tone }> = {
  // Training sessions
  SCHEDULED: { label: "Scheduled", tone: "inert" },
  ATTENDED: { label: "Attended", tone: "positive" },
  NO_SHOW: { label: "No-show", tone: "danger" },
  CANCELLED_BY_CLIENT: { label: "Cancelled by client", tone: "inert" },
  CANCELLED_BY_STUDIO: { label: "Cancelled by studio", tone: "inert" },
  // Leads
  NEW: { label: "New", tone: "warning" },
  CONTACTED: { label: "Contacted", tone: "inert" },
  TRIAL_BOOKED: { label: "Trial booked", tone: "warning" },
  CONVERTED: { label: "Converted", tone: "positive" },
  LOST: { label: "Lost", tone: "danger" },
  // Clients
  ACTIVE: { label: "Active", tone: "positive" },
  INACTIVE: { label: "Inactive", tone: "inert" },
};

const toneClass: Record<Tone, string> = {
  positive: "border-positive/30 bg-positive/10 text-positive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  inert: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const { label, tone } = config[status];
  return (
    <Badge variant="outline" className={cn(toneClass[tone], className)}>
      {label}
    </Badge>
  );
}
