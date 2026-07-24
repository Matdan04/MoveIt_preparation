import type { ReactNode } from "react";
import type { Role } from "@prisma/client";

// Convenience only — NOT a security boundary. Hiding a control from a role that
// can't use it is a UX nicety; the route and the Server Action behind it
// authorize server-side regardless of whether this renders its children.
export function RoleGate({
  actorRole,
  allow,
  children,
}: {
  actorRole: Role;
  allow: Role | Role[];
  children: ReactNode;
}) {
  const allowed = Array.isArray(allow)
    ? allow.includes(actorRole)
    : allow === actorRole;
  return allowed ? <>{children}</> : null;
}
