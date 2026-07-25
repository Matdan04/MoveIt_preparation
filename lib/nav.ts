import {
  CalendarDays,
  UserPlus,
  Users,
  Dumbbell,
  UserCog,
  UserRound,
  FileInput,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";

// The nav is filtered by role for legibility only. This filtering is a UX
// affordance and NEVER a security boundary: every route resolves the actor and
// authorizes server-side in lib/data/*, so a coach who types /manage/audit
// directly is still rejected there regardless of what this list renders.
export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
};

// The unlabelled primary group.
export const primaryNav: NavItem[] = [
  { title: "Today", href: "/today", icon: CalendarDays, roles: ["COACH", "MANAGER"] },
  { title: "Leads", href: "/leads", icon: UserPlus, roles: ["FRONT_DESK", "MANAGER"] },
  { title: "Clients", href: "/clients", icon: Users, roles: ["FRONT_DESK", "COACH", "MANAGER"] },
  { title: "My profile", href: "/profile", icon: UserRound, roles: ["COACH"] },
];

// The MANAGE eyebrow group — manager-only screens. Coaches is the staffing
// roster (add/edit/deactivate); Assignments is the capacity/reassignment board.
export const manageNav: NavItem[] = [
  { title: "Coaches", href: "/manage/coaches", icon: UserCog, roles: ["MANAGER"] },
  { title: "Assignments", href: "/manage/assignments", icon: Dumbbell, roles: ["MANAGER"] },
  { title: "Import", href: "/manage/import", icon: FileInput, roles: ["MANAGER"] },
  { title: "Audit", href: "/manage/audit", icon: ScrollText, roles: ["MANAGER"] },
];

export function navItemsForRole(items: NavItem[], role: Role): NavItem[] {
  return items.filter((item) => item.roles.includes(role));
}

// Where a freshly signed-in actor lands: the first route their role can reach.
export function landingForRole(role: Role): string {
  const first =
    navItemsForRole(primaryNav, role)[0] ?? navItemsForRole(manageNav, role)[0];
  // Every role can reach Clients, so `first` is always defined; fall back
  // defensively rather than sending an authenticated user to a dead path.
  return first?.href ?? "/clients";
}
