"use server";

import { signIn, signOut } from "@/auth";
import { db } from "@/db";
import { users, collaborators } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { detectPreferredCurrency } from "@/lib/utils";

type ActionState = { error?: string } | undefined;

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const signInFormData = new FormData();
  signInFormData.set("email", String(formData.get("email") ?? ""));
  signInFormData.set("password", String(formData.get("password") ?? ""));
  signInFormData.set("redirectTo", "/trips");

  try {
    await signIn("credentials", signInFormData);
  } catch (err) {
    if (err instanceof AuthError) return { error: "Invalid email or password." };
    throw err;
  }
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (process.env.ALLOW_SIGNUP === "false") return { error: "Signup is disabled." };

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!email || !password || password.length < 8) {
    return { error: "Email and password (min 8 chars) required." };
  }

  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  const currency = detectPreferredCurrency(acceptLanguage);
  const passwordHash = await bcrypt.hash(password, 10);
  const [newUser] = await db
    .insert(users)
    .values({ email, name, passwordHash, currency })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (!newUser) return { error: "An account with that email already exists." };

  // Back-fill collaborators shadow records that were invited before signup.
  await db
    .update(collaborators)
    .set({ userId: newUser.id })
    .where(and(eq(collaborators.email, email), isNull(collaborators.userId)));

  const signInFormData = new FormData();
  signInFormData.set("email", email);
  signInFormData.set("password", password);
  signInFormData.set("redirectTo", "/trips");

  await signIn("credentials", signInFormData);
}

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}
