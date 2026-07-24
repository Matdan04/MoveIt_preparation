"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { bookSessionAction } from "./actions";

// Book a session for this client. Coaches see only themselves in the select
// (server-scoped); the package to charge is auto-selected by the service, so
// there is no package picker here — the soonest-expiring eligible one is used.
export function BookDialog({
  clientId,
  coaches,
}: {
  clientId: string;
  coaches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [coachId, setCoachId] = React.useState(coaches.length === 1 ? coaches[0].id : "");
  const [when, setWhen] = React.useState("");
  const [duration, setDuration] = React.useState("60");
  const [pending, startTransition] = React.useTransition();

  const canBook = coachId !== "" && when !== "" && !pending;

  function submit() {
    startTransition(async () => {
      const result = await bookSessionAction({
        clientId,
        coachId,
        scheduledAtLocal: when,
        durationMin: Number(duration),
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Session booked");
      setOpen(false);
      setWhen("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Book session</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book session</DialogTitle>
          <DialogDescription>
            Times are the studio&apos;s local time. A credit is only spent when
            the session is later marked attended.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Coach</Label>
            <Select value={coachId} onValueChange={setCoachId}>
              <SelectTrigger aria-label="Coach">
                <SelectValue placeholder="Choose a coach" />
              </SelectTrigger>
              <SelectContent>
                {coaches.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="book-when">Date and time</Label>
            <Input
              id="book-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="book-duration">Duration (minutes)</Label>
            <Input
              id="book-duration"
              type="number"
              min={15}
              max={480}
              step={15}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="font-mono tabular-nums"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!canBook}>
            Book session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
