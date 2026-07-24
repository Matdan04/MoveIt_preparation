"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LeadStatus } from "@prisma/client";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { advanceLeadAction, convertLeadAction } from "./actions";

// The button verb for advancing to each status, and the matching past-tense
// toast — the two must read as the same action (UI.md copy rule).
const transitionLabel: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Mark contacted",
  TRIAL_BOOKED: "Book trial",
  CONVERTED: "Convert",
  LOST: "Mark lost",
};

const transitionToast: Record<LeadStatus, string> = {
  NEW: "Updated",
  CONTACTED: "Marked contacted",
  TRIAL_BOOKED: "Trial booked",
  CONVERTED: "Converted",
  LOST: "Marked lost",
};

export type LeadRowData = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  ownerName: string;
  status: LeadStatus;
  ageDays: number;
  dateLabel: string;
  // Legal next statuses, computed server-side from the state machine.
  transitions: LeadStatus[];
  canConvert: boolean;
};

export function LeadRow({ lead }: { lead: LeadRowData }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function advance(to: LeadStatus) {
    startTransition(async () => {
      const result = await advanceLeadAction({ leadId: lead.id, to });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(transitionToast[to]);
      setOpen(false);
      router.refresh();
    });
  }

  function convert() {
    startTransition(async () => {
      const result = await convertLeadAction({ leadId: lead.id });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Converted", {
        action: {
          label: "View client",
          onClick: () => router.push(`/clients/${result.clientId}`),
        },
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <TableRow
        className="h-10 cursor-pointer"
        onClick={() => setOpen(true)}
        tabIndex={0}
        role="button"
        aria-label={`Open ${lead.name}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <TableCell className="font-medium">{lead.name}</TableCell>
        <TableCell className="font-mono tabular-nums">{lead.phone}</TableCell>
        <TableCell className="text-muted-foreground">{lead.source}</TableCell>
        <TableCell className="text-muted-foreground">{lead.ownerName}</TableCell>
        <TableCell
          className={cn(
            "text-right font-mono tabular-nums",
            lead.ageDays > 7 && "text-warning",
          )}
        >
          {lead.ageDays}d
        </TableCell>
        <TableCell className="text-right">
          <StatusBadge status={lead.status} />
        </TableCell>
      </TableRow>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{lead.name}</SheetTitle>
            <SheetDescription>
              Captured {lead.dateLabel} · {lead.source}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 p-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="font-mono tabular-nums">{lead.phone}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-mono">{lead.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Owner</dt>
              <dd>{lead.ownerName}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={lead.status} />
              </dd>
            </dl>

            {lead.transitions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Move to
                </p>
                <div className="flex flex-wrap gap-2">
                  {lead.transitions.map((to) => (
                    <Button
                      key={to}
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => advance(to)}
                    >
                      {transitionLabel[to]}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {lead.canConvert ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full" disabled={pending}>
                    Convert to client
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Convert {lead.name} to a client?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This creates a client record, carries the contact details
                      over, and marks the lead converted. It cannot be undone from
                      here.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={convert} disabled={pending}>
                      Convert to client
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
