import "server-only";
import { auth } from "@/auth";
import type { Actor } from "@/data/types";
import { ApiError } from "./errors";
export async function requireApiUser(): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  if (session.user.mfaEnrollmentRequired)
    throw new ApiError(403, "mfa_enrollment_required", "Complete MFA enrollment to continue.");
  return { userId: session.user.id };
}
