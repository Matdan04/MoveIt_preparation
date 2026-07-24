import { redirect } from "next/navigation";
import { getOptionalActor } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

// An already-authenticated visitor has no business on the login screen.
export default async function LoginPage() {
  const actor = await getOptionalActor();
  if (actor) redirect("/");

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-xl font-semibold">MOVE Ops</h1>
      <p className="mt-1 text-sm text-neutral-600">Sign in to continue.</p>
      <LoginForm />
    </main>
  );
}
