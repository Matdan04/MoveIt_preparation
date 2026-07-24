import { redirect } from "next/navigation";
import { getOptionalActor } from "@/lib/auth/session";
import { landingForRole } from "@/lib/nav";

// The root path has no screen of its own — it sends each actor to the first
// route their role can reach.
export default async function Home() {
  const actor = await getOptionalActor();
  if (!actor) redirect("/login");
  redirect(landingForRole(actor.role));
}
