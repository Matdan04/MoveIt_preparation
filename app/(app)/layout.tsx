import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOptionalActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AppSidebar, type SidebarUser } from "@/components/app-sidebar";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware bounces anonymous requests, but a session can die mid-request;
  // resolve again here and redirect rather than throwing into an error boundary.
  const actor = await getOptionalActor();
  if (!actor) redirect("/login");

  // Only the display fields cross into the client sidebar — never passwordHash
  // or anything the RSC payload shouldn't carry into the browser.
  const account = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { name: true, email: true, role: true },
  });
  if (!account) redirect("/login");

  const user: SidebarUser = {
    name: account.name,
    email: account.email,
    role: account.role,
    initials: initialsFrom(account.name),
  };

  // Read the collapse state on the server so first paint renders at the correct
  // width with no layout shift. The shadcn sidebar writes this cookie on toggle.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <AppBreadcrumbs />
        </header>
        <div className="w-full max-w-[1200px] p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
