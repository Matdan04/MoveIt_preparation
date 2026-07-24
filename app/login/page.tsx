import { redirect } from "next/navigation";
import { getOptionalActor } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import { Card, CardContent } from "@/components/ui/card";

// An already-authenticated visitor has no business on the login screen.
export default async function LoginPage() {
  const actor = await getOptionalActor();
  if (actor) redirect("/");

  // Demo credentials for the interview click-through — never rendered in
  // production, where they would be a live account list.
  const demo = process.env.NODE_ENV !== "production";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[380px] space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-xl font-semibold tracking-tight">MOVE</p>
          <p className="text-sm text-muted-foreground">Studio operations</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <LoginForm />
          </CardContent>
        </Card>

        {demo ? (
          <div className="space-y-1 text-center text-xs text-muted-foreground">
            <p>Demo accounts · password &ldquo;password&rdquo;</p>
            <p className="font-mono">manager@example.com — Manager</p>
            <p className="font-mono">frontdesk@example.com — Front desk</p>
            <p className="font-mono">coach@example.com — Coach</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
