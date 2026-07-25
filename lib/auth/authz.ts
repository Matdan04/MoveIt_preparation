// The single source of truth for the capability matrix in CLAUDE.md. Every
// role-level decision ("may a COACH run the import?") is a pure predicate here,
// so the policy can be read in one file and unit-tested without a database.
//
// Two failure shapes, deliberately kept distinct:
//   - ForbiddenError: the actor's ROLE has no claim to a capability at all (a
//     coach touching leads, a front-desk running an import). The UI never
//     offered it; a direct call is an attacker, so failing loudly is correct.
//   - A scoping miss on a specific resource (a coach asking for a client that
//     exists but isn't theirs) is NOT handled here — the data layer returns
//     null so the caller answers notFound() and never leaks existence.

import { Role } from "@prisma/client";
import type { Actor } from "@/lib/auth/session";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

const isManager = (a: Actor) => a.role === Role.MANAGER;
const isFrontDesk = (a: Actor) => a.role === Role.FRONT_DESK;
const isCoach = (a: Actor) => a.role === Role.COACH;

// A coach acts only on resources whose coachId matches their own. If a COACH
// actor somehow carries no coachId it is a data-integrity fault, not a wider
// grant, so we treat it as "owns nothing".
function coachOwns(actor: Actor, resourceCoachId: string): boolean {
  return isCoach(actor) && actor.coachId !== undefined &&
    actor.coachId === resourceCoachId;
}

// --- Predicates (booleans, for conditional rendering / warnings) ----------
// These mirror the capability table. Conditional rendering may read them, but
// they are never the security boundary — the assertions below are.

export const canAccessLeads = (a: Actor): boolean =>
  isFrontDesk(a) || isManager(a);

export const canConvertLead = (a: Actor): boolean =>
  isFrontDesk(a) || isManager(a);

export const canViewAllClients = (a: Actor): boolean =>
  isFrontDesk(a) || isManager(a);

export const canBookForCoach = (a: Actor, coachId: string): boolean =>
  isFrontDesk(a) || isManager(a) || coachOwns(a, coachId);

export const canMarkAttendance = (a: Actor, sessionCoachId: string): boolean =>
  isManager(a) || coachOwns(a, sessionCoachId);

// Manager is read-only on notes (see the capability table): authoring requires
// the coach who owns the session.
export const canWriteOutcomeNote = (a: Actor, sessionCoachId: string): boolean =>
  coachOwns(a, sessionCoachId);

export const canManageAssignments = (a: Actor): boolean => isManager(a);
export const canAdjustCredits = (a: Actor): boolean => isManager(a);
export const canViewAudit = (a: Actor): boolean => isManager(a);
export const canRunImport = (a: Actor): boolean => isManager(a);

// The coach roster itself (add / edit / deactivate / delete a coach) is a
// staffing decision, so manager-only — the same gate as assignments.
export const canManageCoaches = (a: Actor): boolean => isManager(a);

// Who may open a coach's own profile page: a manager sees any coach; a coach
// sees only their own record. Front desk has no business on the staffing side,
// so they see none. As with clients, an out-of-scope read resolves to null at
// the data layer (→ notFound) rather than throwing, so the coach's existence
// never leaks to another coach.
export const canViewCoachProfile = (a: Actor, coachId: string): boolean =>
  isManager(a) || coachOwns(a, coachId);

// --- Assertions (throw ForbiddenError, for the server boundary) -----------
// A service or data function calls the matching assertion before it acts.

export function assertCanAccessLeads(a: Actor): void {
  if (!canAccessLeads(a)) throw new ForbiddenError();
}
export function assertCanConvertLead(a: Actor): void {
  if (!canConvertLead(a)) throw new ForbiddenError();
}
export function assertCanBookForCoach(a: Actor, coachId: string): void {
  if (!canBookForCoach(a, coachId)) throw new ForbiddenError();
}
export function assertCanMarkAttendance(a: Actor, sessionCoachId: string): void {
  if (!canMarkAttendance(a, sessionCoachId)) throw new ForbiddenError();
}
export function assertCanWriteOutcomeNote(a: Actor, sessionCoachId: string): void {
  if (!canWriteOutcomeNote(a, sessionCoachId)) throw new ForbiddenError();
}
export function assertCanManageAssignments(a: Actor): void {
  if (!canManageAssignments(a)) throw new ForbiddenError();
}
export function assertCanAdjustCredits(a: Actor): void {
  if (!canAdjustCredits(a)) throw new ForbiddenError();
}
export function assertCanViewAudit(a: Actor): void {
  if (!canViewAudit(a)) throw new ForbiddenError();
}
export function assertCanRunImport(a: Actor): void {
  if (!canRunImport(a)) throw new ForbiddenError();
}
export function assertCanManageCoaches(a: Actor): void {
  if (!canManageCoaches(a)) throw new ForbiddenError();
}
