"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { addCoachAction } from "./actions";

// Onboard a coach: creates the login and the profile in one go. The email and
// starting password are the login the new coach signs in with; capacity and
// specialties describe how they staff. Everything but the two optional-looking
// fields is required by the server too, so the form only mirrors that.
export function AddCoachDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      specialties: String(form.get("specialties") ?? ""),
      weeklyCapacityHours: Number(form.get("weeklyCapacityHours") ?? 0),
    };
    startTransition(async () => {
      const result = await addCoachAction(data);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Coach added");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Add coach
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Add coach</DialogTitle>
            <DialogDescription>
              Creates the coach&apos;s login and staffing profile together.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="coach-name">Name</Label>
              <Input id="coach-name" name="name" required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coach-email">Email</Label>
              <Input id="coach-email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coach-password">Starting password</Label>
              <Input
                id="coach-password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters. The coach can change it later.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coach-specialties">Specialties</Label>
              <Input
                id="coach-specialties"
                name="specialties"
                placeholder="Strength, Mobility, Rehab"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated. Leave blank if none yet.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coach-capacity">Weekly capacity (hours)</Label>
              <Input
                id="coach-capacity"
                name="weeklyCapacityHours"
                type="number"
                inputMode="numeric"
                min={0}
                max={80}
                defaultValue={20}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add coach"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
