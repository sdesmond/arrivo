"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { z } from "zod";
import type { Endpoint } from "./endpoint";
import { api, ApiClientError } from "./client";
export function useApiMutation<Result, Params extends z.ZodType, Body extends z.ZodType>(
  endpoint: Endpoint<Result, Params, Body>
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fields, setFields] = useState<Record<string, string[]>>({});
  function mutate(input: { params: z.input<Params>; body: z.input<Body> }): Promise<void> {
    setFields({});
    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          await api(endpoint, input);
          router.refresh();
        } catch (error) {
          if (error instanceof ApiClientError) {
            setFields(error.fields ?? {});
            if (error.code === "unauthenticated") router.push("/sign-in");
            else if (error.code === "mfa_enrollment_required") router.push("/mfa-enrollment");
            else toast.error(error.message);
          } else toast.error("Could not save changes. Try again.");
        } finally {
          resolve();
        }
      });
    });
  }
  return { mutate, isPending, fields };
}
