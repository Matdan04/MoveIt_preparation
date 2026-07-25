"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { EditCoachDialog } from "./edit-coach-dialog";
import { setCoachActiveAction, deleteCoachAction } from "./actions";

export type CoachRowData = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  specialties: string[];
  weeklyCapacityHours: number;
  activeClients: number;
  hasHistory: boolean;
};

// One coach on the management roster. The card shows who they are and their
// current load; the overflow menu holds the write actions. Deactivate and
// delete both confirm first — one is reversible, the other is not, and the copy
// says which. Delete is offered ONLY for a coach with no history; the server
// refuses it regardless, so this is a UX affordance, not the guard.
export function CoachRow({ coach }: { coach: CoachRowData }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<
    "edit" | "toggle" | "delete" | null
  >(null);
  const [pending, startTransition] = React.useTransition();

  const load = coach.activeClients;
  const over = load > coach.weeklyCapacityHours;
  const pct =
    coach.weeklyCapacityHours > 0
      ? Math.min(100, (load / coach.weeklyCapacityHours) * 100)
      : 100;

  function toggleActive() {
    startTransition(async () => {
      const result = await setCoachActiveAction({
        coachId: coach.id,
        active: !coach.active,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(coach.active ? "Coach deactivated" : "Coach reactivated");
      if (result.warning) toast.warning(result.warning);
      setDialog(null);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteCoachAction({ coachId: coach.id });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Coach deleted");
      setDialog(null);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg border bg-card p-4",
        !coach.active && "opacity-70",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/coaches/${coach.id}`}
            className="font-medium hover:underline"
          >
            {coach.name}
          </Link>
          {!coach.active ? (
            <Badge variant="outline" className="text-muted-foreground">
              Inactive
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">{coach.email}</p>
        {coach.specialties.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {coach.specialties.map((s) => (
              <Badge key={s} variant="secondary" className="font-normal">
                {s}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="hidden w-40 shrink-0 space-y-1.5 sm:block">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Load</span>
          <span
            className={cn(
              "font-mono text-xs tabular-nums",
              over ? "text-warning" : "text-muted-foreground",
            )}
          >
            {load} / {coach.weeklyCapacityHours}h
          </span>
        </div>
        <Progress
          value={pct}
          className={cn(
            over && "[&_[data-slot=progress-indicator]]:bg-warning",
          )}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={`Actions for ${coach.name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("toggle")}>
            {coach.active ? (
              <>
                <PowerOff className="size-4" />
                Deactivate
              </>
            ) : (
              <>
                <Power className="size-4" />
                Reactivate
              </>
            )}
          </DropdownMenuItem>
          {!coach.hasHistory ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDialog("delete")}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Controlled from the menu — the trigger lives in the dropdown, so the
          dialog itself is driven by state rather than its own trigger. */}
      <EditCoachDialog
        coach={coach}
        open={dialog === "edit"}
        onOpenChange={(o) => setDialog(o ? "edit" : null)}
      />

      <AlertDialog
        open={dialog === "toggle"}
        onOpenChange={(o) => setDialog(o ? "toggle" : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {coach.active
                ? `Deactivate ${coach.name}?`
                : `Reactivate ${coach.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {coach.active
                ? "They will no longer be bookable or able to sign in. Their history stays intact and you can reactivate them anytime."
                : "They will be able to sign in and take assignments again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                toggleActive();
              }}
              disabled={pending}
            >
              {coach.active ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(o) => setDialog(o ? "delete" : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {coach.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This coach has no sessions, notes, or assignments, so they can be
              removed permanently. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete coach
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
