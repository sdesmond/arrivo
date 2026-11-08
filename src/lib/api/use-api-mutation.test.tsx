import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as navigation from "next/navigation";
const { api, error } = vi.hoisted(() => ({ api: vi.fn(), error: vi.fn() }));
vi.mock("./client", async (original) => ({ ...(await original<typeof import("./client")>()), api }));
vi.mock("sonner", () => ({ toast: { error } }));
import { ApiClientError } from "./client";
import { updateChecklistItem } from "./contract/checklists";
import { useApiMutation } from "./use-api-mutation";
const input = { params: { itemId: "item" }, body: { isChecked: true } };
const router = {
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(navigation, "useRouter").mockReturnValue(router);
});
it("refreshes after success", async () => {
  api.mockResolvedValue({ id: "item" });
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  await act(async () => {
    await result.current.mutate(input);
  });
  expect(router.refresh).toHaveBeenCalledOnce();
  expect(error).not.toHaveBeenCalled();
});
it.each([
  [401, "unauthenticated", "/sign-in"],
  [403, "mfa_enrollment_required", "/mfa-enrollment"],
] as const)("navigates for %s %s", async (status, code, path) => {
  api.mockRejectedValue(new ApiClientError(status, code, "Sign in"));
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  await act(async () => {
    await result.current.mutate(input);
  });
  expect(router.push).toHaveBeenCalledWith(path);
  expect(router.refresh).not.toHaveBeenCalled();
});
it("surfaces field errors and never refreshes failures", async () => {
  api.mockRejectedValue(new ApiClientError(422, "validation_failed", "Invalid", { isChecked: ["Required"] }));
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  await act(async () => {
    await result.current.mutate(input);
  });
  expect(result.current.fields).toEqual({ isChecked: ["Required"] });
  expect(error).toHaveBeenCalledWith("Invalid");
  expect(router.refresh).not.toHaveBeenCalled();
});
it("surfaces network errors", async () => {
  api.mockRejectedValue(new Error("network"));
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  await act(async () => {
    await result.current.mutate(input);
  });
  expect(error).toHaveBeenCalledWith("Could not save changes. Try again.");
  expect(router.refresh).not.toHaveBeenCalled();
});

it("keeps its returned promise pending until the mutation settles", async () => {
  let resolveRequest: (value: unknown) => void = () => {
    throw new Error("Request not started");
  };
  api.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
  );
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  let finished = false;
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = result.current.mutate(input);
    void pending.then(() => {
      finished = true;
    });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(finished).toBe(false);
  expect(router.refresh).not.toHaveBeenCalled();
  await act(async () => {
    resolveRequest({ id: "item" });
    await pending;
  });
  expect(finished).toBe(true);
  expect(router.refresh).toHaveBeenCalledOnce();
});
