"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TrainingSessionStatus } from "@prisma/client";
import { CreditRail, type RailEntry } from "@/components/credit-rail";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  markAttendedAction,
  markNoShowAction,
  cancelStudioAction,
  saveNoteAction,
  type ActionResult,
} from "./actions";

export type SessionRowData = {
  id: string;
  clientName: string;
  timeLabel: string;
  durationMin: number;
  status: TrainingSessionStatus;
  note: string | null;
  railEntries: RailEntry[];
  expiresLabel?: string;
  // A past session still marked SCHEDULED: the coach owes an attendance mark.
  owesMark: boolean;
  // Whether recording a no-show now falls inside the 12-hour charge window.
  within12h: boolean;
};

export function SessionRow({ session }: { session: SessionRowData }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState(session.note ?? "");
  const [pending, startTransition] = React.useTransition();

  const scheduled = session.status === "SCHEDULED";

  function run(
    action: (data: { sessionId: string; note?: string }) => Promise<ActionResult>,
    verb: string,
  ) {
    startTransition(async () => {
      const result = await action({
        sessionId: session.id,
        note: note.trim() || undefined,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(verb);
      setOpen(false);
      router.refresh();
    });
  }

  function onlyNote() {
    startTransition(async () => {
      const result = await saveNoteAction({ sessionId: session.id, note: note.trim() });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Note saved");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            session.owesMark && "border-l-2 border-l-warning",
          )}
        >
          <span className="w-12 shrink-0 font-mono text-base tabular-nums">
            {session.timeLabel}
          </span>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block truncate font-medium">{session.clientName}</span>
            {session.railEntries.length > 0 ? (
              <CreditRail entries={session.railEntries} variant="compact" />
            ) : null}
          </span>
          <StatusBadge status={session.status} />
        </button>
      </SheetTrigger>

      <SheetContent side="bottom" className="mx-auto max-w-lg">
        <SheetHeader>
          <SheetTitle>{session.clientName}</SheetTitle>
          <SheetDescription>
            <span className="font-mono tabular-nums">{session.timeLabel}</span> ·{" "}
            {session.durationMin} min
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 p-4">
          {scheduled ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                disabled={pending}
                onClick={() => run(markAttendedAction, "Marked attended")}
              >
                Mark attended
              </Button>
              <div className="space-y-1">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={pending}
                  onClick={() => run(markNoShowAction, "Marked no-show")}
                >
                  No-show
                </Button>
                {session.within12h ? (
                  <p className="text-xs text-warning">
                    Within 12 hours — this will use a credit.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    More than 12 hours out — no credit used.
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(cancelStudioAction, "Cancelled")}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Outcome</span>
              <StatusBadge status={session.status} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`note-${session.id}`}>Outcome note</Label>
            <Textarea
              id={`note-${session.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened in the session."
              rows={3}
            />
            {!scheduled ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending || note.trim().length === 0}
                onClick={onlyNote}
              >
                Save note
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
