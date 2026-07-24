"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bell, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <p className="eyebrow">{title}</p>
      {children}
    </section>
  );
}

const CHROME = [
  { name: "Paper", token: "--background", note: "page background" },
  { name: "Surface", token: "--card", note: "cards, sidebar, popovers" },
  { name: "Rule", token: "--border", note: "borders, dividers" },
  { name: "Muted ink", token: "--muted-foreground", note: "secondary text" },
  { name: "Ink", token: "--foreground", note: "primary text" },
  { name: "Primary", token: "--primary", note: "actions, ring, active nav" },
];

const STATUS = [
  { name: "Positive", token: "--positive", note: "attended" },
  { name: "Warning", token: "--warning", note: "low credits" },
  { name: "Danger", token: "--danger", note: "no-show, conflict" },
  { name: "Inert", token: "--inert", note: "cancelled" },
];

const TYPE_SCALE = [
  { px: 24, cls: "text-2xl", note: "page title — nothing goes above this" },
  { px: 20, cls: "text-xl", note: "section heading" },
  { px: 16, cls: "text-base", note: "emphasis, times" },
  { px: 14, cls: "text-sm", note: "body — base size" },
  { px: 13, cls: "text-[13px]", note: "dense secondary" },
  { px: 12, cls: "text-xs", note: "captions, demo hints" },
];

function Swatch({
  name,
  token,
  note,
}: {
  name: string;
  token: string;
  note: string;
}) {
  return (
    <div className="space-y-1.5">
      <div
        className="h-14 w-full rounded-md border"
        style={{ backgroundColor: `var(${token})` }}
      />
      <div className="text-sm font-medium">{name}</div>
      <div className="font-mono text-xs text-muted-foreground">{token}</div>
      <div className="text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

export function TokenShowcase() {
  const [date, setDate] = React.useState<Date | undefined>(new Date());

  return (
    <div className="space-y-8">
      <Section title="Chrome — six values">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
          {CHROME.map((c) => (
            <Swatch key={c.token} {...c} />
          ))}
        </div>
      </Section>

      <Section title="Status — reserved for meaning">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {STATUS.map((c) => (
            <Swatch key={c.token} {...c} />
          ))}
        </div>
      </Section>

      <Section title="Type scale — 12 / 13 / 14 / 16 / 20 / 24">
        <div className="space-y-2">
          {TYPE_SCALE.map((t) => (
            <div key={t.px} className="flex items-baseline gap-4">
              <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">
                {t.px}px
              </span>
              <span className={t.cls}>The quick brown fox</span>
              <span className="text-xs text-muted-foreground">{t.note}</span>
            </div>
          ))}
          <Separator className="my-2" />
          <p className="eyebrow">Eyebrow label — 11px, tracked, muted</p>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              Mono tabular figures align on the decimal:
            </div>
            <pre className="font-mono text-sm leading-tight">
              {"RM 1,200.00\nRM    90.50\nRM 12,340.00\n08:30  ·  12 of 24"}
            </pre>
          </div>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Notifications">
            <Bell />
          </Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="demo-email">Email</Label>
            <Input id="demo-email" placeholder="aisyah@move.studio" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demo-pkg">Package</Label>
            <Select>
              <SelectTrigger id="demo-pkg">
                <SelectValue placeholder="Select a package" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-12">PT 12 sessions</SelectItem>
                <SelectItem value="pt-24">PT 24 sessions</SelectItem>
                <SelectItem value="class-10">Class pack 10</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="demo-note">Outcome note</Label>
            <Textarea id="demo-note" placeholder="How did the session go?" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch id="demo-switch" defaultChecked />
            <Label htmlFor="demo-switch">Active coach</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="demo-check" defaultChecked />
            <Label htmlFor="demo-check">Within 12 hours</Label>
          </div>
          <RadioGroup defaultValue="attended" className="flex gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="attended" id="r-att" />
              <Label htmlFor="r-att">Attended</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no-show" id="r-ns" />
              <Label htmlFor="r-ns">No-show</Label>
            </div>
          </RadioGroup>
        </div>
      </Section>

      <Section title="Badges — chrome + status">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge className="border-transparent bg-positive/15 text-positive">
            Attended
          </Badge>
          <Badge className="border-transparent bg-warning/15 text-warning">
            Low credits
          </Badge>
          <Badge className="border-transparent bg-danger/15 text-danger">
            No-show
          </Badge>
          <Badge className="border-transparent bg-inert/15 text-inert">
            Cancelled
          </Badge>
        </div>
      </Section>

      <Section title="Card, tabs, alert, progress">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Nurul Ain</CardTitle>
              <CardDescription>Active · joined 12 Mar 2024</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs defaultValue="packages">
                <TabsList>
                  <TabsTrigger value="packages">Packages</TabsTrigger>
                  <TabsTrigger value="sessions">Sessions</TabsTrigger>
                </TabsList>
                <TabsContent value="packages" className="pt-2 text-sm">
                  <span className="font-mono">8 of 12</span> used · expires 14
                  Sep
                </TabsContent>
                <TabsContent value="sessions" className="pt-2 text-sm">
                  Last: 08:30, attended
                </TabsContent>
              </Tabs>
              <Progress value={66} />
            </CardContent>
          </Card>
          <div className="space-y-3">
            <Alert>
              <Bell />
              <AlertTitle>Attendance owed</AlertTitle>
              <AlertDescription>
                Two past sessions are still marked scheduled.
              </AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <Bell />
              <AlertTitle>Booking conflict</AlertTitle>
              <AlertDescription>
                This coach already has a session at 08:30.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </Section>

      <Section title="Table — mono numeric columns">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Coach</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead className="text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["Nurul Ain", "Farid", "8 / 12", "1,200.00"],
              ["Wei Ling", "Priya", "22 / 24", "2,150.00"],
              ["Arjun Menon", "Farid", "1 / 10", "890.00"],
            ].map(([client, coach, credits, price]) => (
              <TableRow key={client}>
                <TableCell>{client}</TableCell>
                <TableCell>{coach}</TableCell>
                <TableCell className="text-right font-mono">{credits}</TableCell>
                <TableCell className="text-right font-mono">
                  RM {price}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Overlays — dialog, sheet, popover, tooltip, menu, toast">
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reassign coach</DialogTitle>
                <DialogDescription>
                  A reason is required before this can be confirmed.
                </DialogDescription>
              </DialogHeader>
              <Input placeholder="Reason" />
              <DialogFooter>
                <Button>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Alert dialog</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Commit approved matches?</AlertDialogTitle>
                <AlertDialogDescription>
                  This is irreversible. It writes to live tables.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Commit</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Mark session</SheetTitle>
                <SheetDescription>
                  Within 12 hours — this will use a credit.
                </SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Popover</Button>
            </PopoverTrigger>
            <PopoverContent className="text-sm">
              Consumed 08:30 · marked by Farid
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>Manual adjustment · comp</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>aisyah@move.studio</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            onClick={() =>
              toast.success("Marked attended", {
                description: "Nurul Ain · 08:30",
              })
            }
          >
            Toast
          </Button>
        </div>
      </Section>

      <Section title="Command, calendar, breadcrumb, avatar, scroll area">
        <div className="grid gap-4 md:grid-cols-2">
          <Command className="rounded-md border">
            <CommandInput placeholder="Search clients…" />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading="Clients">
                <CommandItem>Nurul Ain</CommandItem>
                <CommandItem>Wei Ling</CommandItem>
                <CommandItem>Arjun Menon</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>

          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md border w-fit"
          />
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Clients</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>Nurul Ain</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center gap-2">
            <Avatar>
              <AvatarFallback>NA</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>WL</AvatarFallback>
            </Avatar>
          </div>

          <ScrollArea className="h-20 w-48 rounded-md border p-2 text-sm">
            <div className="space-y-1">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i}>Session log line {i + 1}</div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </Section>

      <Section title="Skeleton — static, no shimmer">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Section>
    </div>
  );
}
