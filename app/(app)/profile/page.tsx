import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";

// "My profile" for a coach. The actor's own coachId is only known at request
// time, so this thin route resolves it and forwards to the shared coach detail
// page rather than duplicating it. A non-coach actor has no profile of this
// kind, so they get a 404 rather than a redirect to someone else's page.
export default async function ProfilePage() {
  const actor = await requireActor();
  if (!actor.coachId) notFound();
  redirect(`/coaches/${actor.coachId}`);
}
