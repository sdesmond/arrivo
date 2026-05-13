"use server";

import { signIn, signOut } from "@/auth";
import { db } from "@/db";
import { users, collaborators } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";

type ActionState = { error?: string } | undefined;

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  try {
    await signIn("credentials", { email, password, redirectTo: "/trips" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Invalid email or password." };
    throw e;
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

  const passwordHash = await bcrypt.hash(password, 10);
  const [newUser] = await db
    .insert(users)
    .values({ email, name, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (!newUser) return { error: "An account with that email already exists." };

  // Back-fill collaborators shadow records that were invited before signup.
  await db
    .update(collaborators)
    .set({ userId: newUser.id })
    .where(and(eq(collaborators.email, email), isNull(collaborators.userId)));

  await signIn("credentials", { email, password, redirectTo: "/trips" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}
