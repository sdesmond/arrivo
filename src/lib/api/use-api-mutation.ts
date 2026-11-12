"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { z } from "zod";
import type { Endpoint } from "./endpoint";
import { api, ApiClientError } from "./client";

/** Field errors are kept per resource key; a write without a key shares this one. */
const UNKEYED = "";

interface MutationOptions<Result> {
  key?: string;
  onSuccess?: (result: Result) => void;
  waitForRefresh?: (result: Result) => Promise<void>;
  onError?: (error: unknown) => void;
  /** Error codes the caller handles in `onError` itself, so the hook shows no toast for them. */
  expectedCodes?: string[];
  onAuthLost?: () => void;
  onSettled?: () => void;
}

function reportAfterCommit(error: unknown): void {
  console.error("[api] A step after the write committed failed:", error);
}

function omitKey(
  fields: Record<string, Record<string, string[]>>,
  key: string
): Record<string, Record<string, string[]>> {
  if (!(key in fields)) return fields;
  const rest = { ...fields };
  delete rest[key];
  return rest;
}

export function useApiMutation<Result, Params extends z.ZodType, Body extends z.ZodType>(
  endpoint: Endpoint<Result, Params, Body>
) {
  const router = useRouter();
  const [refreshPending, startTransition] = useTransition();
  const [pendingCount, setPendingCount] = useState(0);
  const [fields, setFields] = useState<Record<string, Record<string, string[]>>>({});
  const queues = useRef(new Map<string, Promise<void>>());
  const refreshWaiters = useRef(new Set<() => void>());
  const mounted = useRef(true);
  const authLost = useRef(false);

  useEffect(() => {
    if (!refreshPending) {
      for (const resolve of refreshWaiters.current) resolve();
      refreshWaiters.current.clear();
    }
  }, [refreshPending]);

  useEffect(() => {
    mounted.current = true;
    const waiters = refreshWaiters.current;
    return () => {
      mounted.current = false;
      for (const resolve of waiters) resolve();
      waiters.clear();
    };
  }, []);

  function mutate(
    input: { params: z.input<Params>; body: z.input<Body>; file?: File; timeoutMs?: number },
    options: MutationOptions<Result> = {}
  ): Promise<void> {
    // A write the user made still goes out after the component unmounts (navigation, tab switch): only the UI
    // follow-up is skipped, so a queued edit or drag is not silently dropped.
    if (authLost.current) {
      if (mounted.current) options.onAuthLost?.();
      return Promise.resolve();
    }
    const counted = mounted.current;
    if (counted) setPendingCount((count) => count + 1);
    async function run(): Promise<void> {
      try {
        if (authLost.current) {
          if (mounted.current) options.onAuthLost?.();
          return;
        }
        const fieldsKey = options.key ?? UNKEYED;
        if (mounted.current) setFields((current) => omitKey(current, fieldsKey));
        const result = await api(endpoint, input);
        if (!mounted.current || authLost.current) return;
        // The write has committed, so nothing below may surface as a failed save.
        try {
          options.onSuccess?.(result);
        } catch (afterCommitError) {
          reportAfterCommit(afterCommitError);
        }
        try {
          if (options.key) {
            let releaseRefresh!: () => void;
            const transitionSettled = new Promise<void>((resolve) => {
              releaseRefresh = resolve;
              refreshWaiters.current.add(resolve);
            });
            let propsSettled: Promise<void> | undefined;
            try {
              propsSettled = options.waitForRefresh?.(result);
            } catch (afterCommitError) {
              reportAfterCommit(afterCommitError);
            }
            try {
              startTransition(() => router.refresh());
              await (propsSettled ? Promise.race([propsSettled, transitionSettled]) : transitionSettled);
            } finally {
              refreshWaiters.current.delete(releaseRefresh);
            }
          } else {
            startTransition(() => router.refresh());
          }
        } catch (afterCommitError) {
          reportAfterCommit(afterCommitError);
        }
      } catch (error) {
        if (authLost.current) return;
        if (error instanceof ApiClientError) {
          const errorFields = error.fields;
          if (errorFields && mounted.current) {
            setFields((current) => ({ ...current, [options.key ?? UNKEYED]: errorFields }));
          }
          if (error.code === "unauthenticated" || error.code === "mfa_enrollment_required") {
            authLost.current = true;
            for (const resolve of refreshWaiters.current) resolve();
            refreshWaiters.current.clear();
            options.onAuthLost?.();
            router.push(error.code === "unauthenticated" ? "/sign-in" : "/mfa-enrollment");
          } else {
            // An unmounted caller cannot handle its expected code, so the toast is the only report left.
            if (!mounted.current || !options.expectedCodes?.includes(error.code)) toast.error(error.message);
            if (mounted.current) options.onError?.(error);
          }
        } else {
          toast.error("Could not save changes. Try again.");
          if (mounted.current) options.onError?.(error);
        }
      } finally {
        if (mounted.current) {
          options.onSettled?.();
          if (counted) setPendingCount((count) => count - 1);
        }
      }
    }
    const previous = options.key ? queues.current.get(options.key) : undefined;
    const pending = previous ? previous.then(run, run) : run();
    if (options.key) {
      const key = options.key;
      queues.current.set(key, pending);
      const clearQueue = () => {
        if (queues.current.get(key) === pending) queues.current.delete(key);
      };
      void pending.then(clearQueue, clearQueue);
    }
    return pending;
  }
  return { mutate, isPending: pendingCount > 0 || refreshPending, fields };
}
