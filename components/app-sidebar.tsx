"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";
import type { Role } from "@prisma/client";
import { logout } from "@/app/login/actions";
import {
  primaryNav,
  manageNav,
  navItemsForRole,
  type NavItem,
} from "@/lib/nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";

const roleLabels: Record<Role, string> = {
  FRONT_DESK: "Front desk",
  COACH: "Coach",
  MANAGER: "Manager",
};

export type SidebarUser = {
  name: string;
  email: string;
  role: Role;
  initials: string;
};

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={item.title}
              // Active item: a 2px Primary left rule and ink text on the
              // Surface ground — never the whole item filled with accent.
              className="border-l-2 border-transparent data-[active=true]:border-l-primary data-[active=true]:bg-transparent data-[active=true]:font-medium"
            >
              <Link href={item.href}>
                <item.icon strokeWidth={1.75} />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const primary = navItemsForRole(primaryNav, user.role);
  const manage = navItemsForRole(manageNav, user.role);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground">
            M
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight">MOVE</span>
            <span className="text-xs text-muted-foreground">
              Bukit Bintang studio
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavList items={primary} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>

        {manage.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavList items={manage} pathname={pathname} />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <ThemeSwitcher />
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-accent"
                >
                  <Avatar className="size-8 rounded-md">
                    <AvatarFallback className="rounded-md text-xs">
                      {user.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start leading-tight">
                    <span className="truncate text-sm font-medium">
                      {user.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {roleLabels[user.role]}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                className="w-56"
                sideOffset={8}
              >
                <DropdownMenuLabel className="flex flex-col gap-1 font-normal">
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.email}
                  </span>
                  <Badge
                    variant="outline"
                    className="mt-1 w-fit text-muted-foreground"
                  >
                    {roleLabels[user.role]}
                  </Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* Log out posts a real form to a Server Action that deletes the
                    AuthSession row and clears the cookie — never a client call. */}
                <form action={logout}>
                  <DropdownMenuItem asChild>
                    <button
                      type="submit"
                      className={cn(
                        "w-full text-destructive focus:text-destructive",
                      )}
                    >
                      <LogOut className="text-destructive" />
                      Log out
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
