import { redirect } from "next/navigation";
import { getOptionalActor } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// An already-authenticated visitor has no business on the login screen.
export default async function LoginPage() {
  const actor = await getOptionalActor();
  if (actor) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">MOVE Ops</CardTitle>
          <CardDescription>Sign in to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
