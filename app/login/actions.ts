"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { startSession, endSession } from "@/lib/auth/session";

const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

// A bcrypt hash of a fixed string. When the email is unknown we still run a
// verify against this so a missing account costs the same time as a wrong
// password, blunting user enumeration by timing.
const DUMMY_HASH =
  "$2b$12$mp7kPgfe3UfkIPvTDSy5guuX48IczMYfznop9UcU60I59yHdhPJ7q";

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  // One message for unknown email, wrong password, or a disabled account —
  // never reveal which of the three failed, and never apologise.
  const invalid: LoginState = {
    error: "That email and password don't match.",
  };
  if (!user || !user.isActive) {
    await verifyPassword(parsed.data.password, DUMMY_HASH);
    return invalid;
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return invalid;

  await startSession(user.id);
  // redirect() throws internally to unwind; must be outside any try/catch.
  redirect("/");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}
