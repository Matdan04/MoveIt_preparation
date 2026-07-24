"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { reassignCoachAction } from "@/app/(app)/clients/[id]/actions";

// Shared by the client detail page and the assignments board. Requires a reason
// before the confirm button enables — a reassignment is a recorded event, not a
// silent one.
export function ReassignDialog({
  clientId,
  clientName,
  coaches,
  currentCoachId,
  trigger,
}: {
  clientId: string;
  clientName: string;
  coaches: { id: string; name: string }[];
  currentCoachId?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [coachId, setCoachId] = React.useState<string>("");
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  // Offer only coaches other than the current one — reassigning to the same
  // coach is a no-op the service would ignore anyway.
  const options = coaches.filter((c) => c.id !== currentCoachId);
  const canConfirm = coachId !== "" && reason.trim().length > 0 && !pending;

  function submit() {
    startTransition(async () => {
      const result = await reassignCoachAction({ clientId, coachId, reason: reason.trim() });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Coach reassigned");
      if (result.warning) toast.warning(result.warning);
      setOpen(false);
      setReason("");
      setCoachId("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            Reassign
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign {clientName}</DialogTitle>
          <DialogDescription>
            Close the current coaching relationship and open a new one. Both are
            kept in the client&apos;s history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>New coach</Label>
            <Select value={coachId} onValueChange={setCoachId}>
              <SelectTrigger aria-label="New coach">
                <SelectValue placeholder="Choose a coach" />
              </SelectTrigger>
              <SelectContent>
                {options.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reassign-reason">Reason</Label>
            <Textarea
              id="reassign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this client moving coach?"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!canConfirm}>
            Reassign coach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
