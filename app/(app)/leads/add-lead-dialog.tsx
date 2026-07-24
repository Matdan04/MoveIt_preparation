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
import { addLeadAction } from "./actions";

export function AddLeadDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      name: String(form.get("name") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),
      source: String(form.get("source") ?? ""),
    };
    startTransition(async () => {
      const result = await addLeadAction(data);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Lead added");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Add lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Add lead</DialogTitle>
            <DialogDescription>
              Capture a new lead at the top of the pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="lead-name">Name</Label>
              <Input id="lead-name" name="name" required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-phone">Phone</Label>
              <Input id="lead-phone" name="phone" required inputMode="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-email">Email (optional)</Label>
              <Input id="lead-email" name="email" type="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-source">Source</Label>
              <Input
                id="lead-source"
                name="source"
                required
                placeholder="Walk-in, referral, Instagram…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
