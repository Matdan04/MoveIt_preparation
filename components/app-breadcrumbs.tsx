"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// Known path segments to their display label. Unknown segments (e.g. a client
// id) fall through to a title-cased version so a deep link still reads.
const LABELS: Record<string, string> = {
  today: "Today",
  leads: "Leads",
  clients: "Clients",
  manage: "Manage",
  assignments: "Coaches",
  import: "Import",
  audit: "Audit",
};

function labelFor(segment: string): string {
  return (
    LABELS[segment] ??
    segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")
  );
}

export function AppBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // "manage" is a grouping segment with no page of its own — show it as inert
  // text rather than a link that 404s.
  const crumbs = segments.map((segment, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    return {
      label: labelFor(segment),
      href,
      isLast: i === segments.length - 1,
      linkable: segment !== "manage",
    };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb) => (
          <div key={crumb.href} className="flex items-center gap-1.5">
            <BreadcrumbItem>
              {crumb.isLast || !crumb.linkable ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!crumb.isLast ? <BreadcrumbSeparator /> : null}
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
