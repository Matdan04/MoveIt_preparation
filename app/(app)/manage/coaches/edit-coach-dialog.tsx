"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateCoachAction } from "./actions";

export type EditableCoach = {
  id: string;
  name: string;
  specialties: string[];
  weeklyCapacityHours: number;
};

// Edit a coach's profile. Works two ways: pass `trigger` for a self-contained
// button (the detail page), or drive `open`/`onOpenChange` from a parent (the
// roster row's menu, where the trigger lives inside a dropdown). Email and role
// are not editable here — that is a login change, not a profile edit.
export function EditCoachDialog({
  coach,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  coach: EditableCoach;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (!isControlled) setUncontrolledOpen(next);
  };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      coachId: coach.id,
      name: String(form.get("name") ?? ""),
      specialties: String(form.get("specialties") ?? ""),
      weeklyCapacityHours: Number(form.get("weeklyCapacityHours") ?? 0),
    };
    startTransition(async () => {
      const result = await updateCoachAction(data);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Coach updated");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit {coach.name}</DialogTitle>
            <DialogDescription>
              Update the coach&apos;s name, specialties, and weekly capacity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-coach-name">Name</Label>
              <Input
                id="edit-coach-name"
                name="name"
                required
                defaultValue={coach.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-coach-specialties">Specialties</Label>
              <Input
                id="edit-coach-specialties"
                name="specialties"
                placeholder="Strength, Mobility, Rehab"
                defaultValue={coach.specialties.join(", ")}
              />
              <p className="text-xs text-muted-foreground">Comma-separated.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-coach-capacity">
                Weekly capacity (hours)
              </Label>
              <Input
                id="edit-coach-capacity"
                name="weeklyCapacityHours"
                type="number"
                inputMode="numeric"
                min={0}
                max={80}
                required
                defaultValue={coach.weeklyCapacityHours}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The default self-contained edit button for the detail page.
export function EditCoachButton({ coach }: { coach: EditableCoach }) {
  return (
    <EditCoachDialog
      coach={coach}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="size-4" />
          Edit
        </Button>
      }
    />
  );
}
