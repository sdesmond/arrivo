import { use, useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as navigation from "next/navigation";
const { api, error } = vi.hoisted(() => ({ api: vi.fn(), error: vi.fn() }));
vi.mock("./client", async (original) => ({ ...(await original<typeof import("./client")>()), api }));
vi.mock("sonner", () => ({ toast: { error } }));
import { ApiClientError, REQUEST_TIMEOUT_MS } from "./client";
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
  expect(result.current.fields).toEqual({ "": { isChecked: ["Required"] } });
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

it("serializes one resource through refresh while allowing another resource to start", async () => {
  const requests: Array<() => void> = [];
  api.mockImplementation(() => new Promise<void>((resolve) => requests.push(resolve)));
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  act(() => {
    void result.current.mutate(input, { key: "first" });
    void result.current.mutate({ ...input, body: { isChecked: false } }, { key: "first" });
    void result.current.mutate(input, { key: "second" });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api).toHaveBeenCalledTimes(2);
  await act(async () => {
    requests[0]();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api).toHaveBeenCalledTimes(3);
  await act(async () => {
    requests[1]();
    requests[2]();
  });
});

it("continues a resource queue after a failed write", async () => {
  api.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ id: "item" });
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  act(() => {
    void result.current.mutate(input, { key: "item" });
    void result.current.mutate(input, { key: "item" });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api).toHaveBeenCalledTimes(2);
});

it.each([
  [401, "unauthenticated"],
  [403, "mfa_enrollment_required"],
] as const)("skips queued writes after %s auth loss and navigates once", async (status, code) => {
  api.mockRejectedValue(new ApiClientError(status, code, "Sign in"));
  const onAuthLost = vi.fn();
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  act(() => {
    void result.current.mutate(input, { key: "item", onAuthLost });
    void result.current.mutate(input, { key: "item", onAuthLost });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api).toHaveBeenCalledOnce();
  expect(router.push).toHaveBeenCalledOnce();
  expect(onAuthLost).toHaveBeenCalled();
});

it("holds the same-resource queue until a delayed refresh commits", async () => {
  let releaseRefresh!: () => void;
  const blocked = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  api.mockResolvedValue({ id: "item" });
  const { result } = renderHook(() => {
    const [refresh, setRefresh] = useState<Promise<void> | null>(null);
    router.refresh.mockImplementation(() => setRefresh(blocked));
    const mutation = useApiMutation(updateChecklistItem);
    if (refresh) use(refresh);
    return mutation;
  });
  act(() => {
    void result.current.mutate(input, { key: "item" });
    void result.current.mutate(input, { key: "item" });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api).toHaveBeenCalledOnce();
  await act(async () => {
    releaseRefresh();
  });
  expect(api).toHaveBeenCalledTimes(2);
  router.refresh.mockReset();
});

it("skips queued writes and callbacks after unmount", async () => {
  let releaseRequest!: (value: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((resolve) => {
        releaseRequest = resolve;
      })
  );
  const onSettled = vi.fn();
  const { result, unmount } = renderHook(() => useApiMutation(updateChecklistItem));
  let pending!: Promise<void>;
  act(() => {
    void result.current.mutate(input, { key: "item", onSettled });
    pending = result.current.mutate(input, { key: "item", onSettled });
  });
  unmount();
  releaseRequest({ id: "item" });
  await pending;
  expect(api).toHaveBeenCalledOnce();
  expect(onSettled).not.toHaveBeenCalled();
  expect(router.refresh).not.toHaveBeenCalled();
});

it("continues through a middle failure so the final absolute write wins", async () => {
  api
    .mockResolvedValueOnce({ id: "item", isChecked: true })
    .mockRejectedValueOnce(new ApiClientError(500, "server_error", "Middle write failed"))
    .mockResolvedValueOnce({ id: "item", isChecked: true });
  const onSuccess = vi.fn();
  const onError = vi.fn();
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  act(() => {
    void result.current.mutate(input, { key: "item", onSuccess });
    void result.current.mutate({ ...input, body: { isChecked: false } }, { key: "item", onError });
    void result.current.mutate(input, { key: "item", onSuccess });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api.mock.calls.map(([, request]) => request.body.isChecked)).toEqual([true, false, true]);
  expect(onSuccess).toHaveBeenCalledTimes(2);
  expect(onError).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledWith("Middle write failed");
});

it("starts B2 when B props commit while A refresh remains pending", async () => {
  let releaseFirstRefresh!: () => void;
  const firstRefresh = new Promise<void>((resolve) => {
    releaseFirstRefresh = resolve;
  });
  let commitSecondProps!: () => void;
  const secondProps = new Promise<void>((resolve) => {
    commitSecondProps = resolve;
  });
  api.mockResolvedValue({ id: "item" });
  const { result } = renderHook(() => {
    const [refresh, setRefresh] = useState<Promise<void> | null>(null);
    router.refresh.mockImplementationOnce(() => setRefresh(firstRefresh));
    const mutation = useApiMutation(updateChecklistItem);
    if (refresh) use(refresh);
    return mutation;
  });
  act(() => {
    void result.current.mutate(input, { key: "first" });
    void result.current.mutate(input, { key: "second", waitForRefresh: () => secondProps });
    void result.current.mutate({ ...input, body: { isChecked: false } }, { key: "second" });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api).toHaveBeenCalledTimes(2);
  await act(async () => {
    commitSecondProps();
  });
  expect(api).toHaveBeenCalledTimes(3);
  await act(async () => {
    releaseFirstRefresh();
  });
  router.refresh.mockReset();
});

it("releases other active refresh waiters promptly after auth loss", async () => {
  let releaseRefresh!: () => void;
  const blockedRefresh = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  api
    .mockResolvedValueOnce({ id: "item" })
    .mockRejectedValueOnce(new ApiClientError(401, "unauthenticated", "Sign in"));
  const onSettled = vi.fn();
  const onAuthLost = vi.fn();
  const { result } = renderHook(() => {
    const [refresh, setRefresh] = useState<Promise<void> | null>(null);
    router.refresh.mockImplementationOnce(() => setRefresh(blockedRefresh));
    const mutation = useApiMutation(updateChecklistItem);
    if (refresh) use(refresh);
    return mutation;
  });
  act(() => {
    void result.current.mutate(input, { key: "first", onSettled });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(onSettled).not.toHaveBeenCalled();
  act(() => {
    void result.current.mutate(input, { key: "second", onAuthLost });
    void result.current.mutate(input, { key: "first", onAuthLost });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(onSettled).toHaveBeenCalledOnce();
  expect(onAuthLost).toHaveBeenCalledTimes(2);
  expect(api).toHaveBeenCalledTimes(2);
  expect(router.push).toHaveBeenCalledOnce();
  await act(async () => {
    releaseRefresh();
  });
  router.refresh.mockReset();
});

it("clears a queued validation failure when the next write starts and succeeds", async () => {
  api
    .mockRejectedValueOnce(new ApiClientError(422, "validation_failed", "Invalid", { isChecked: ["Required"] }))
    .mockResolvedValueOnce({ id: "item" });
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  act(() => {
    void result.current.mutate(input, { key: "item" });
    void result.current.mutate(input, { key: "item" });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledWith("Invalid");
  expect(result.current.fields).toEqual({});
});

it("keeps each resource's field errors while other writes start and succeed", async () => {
  api
    .mockRejectedValueOnce(new ApiClientError(422, "validation_failed", "Invalid", { content: ["Too long"] }))
    .mockResolvedValueOnce({ id: "other" })
    .mockRejectedValueOnce(new ApiClientError(422, "validation_failed", "Invalid", { isChecked: ["Required"] }));
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  await act(async () => {
    await result.current.mutate(input, { key: "first" });
  });
  expect(result.current.fields).toEqual({ first: { content: ["Too long"] } });
  act(() => {
    void result.current.mutate(input, { key: "second" });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api).toHaveBeenCalledTimes(2);
  expect(result.current.fields).toEqual({ first: { content: ["Too long"] } });
  await act(async () => {
    await result.current.mutate(input, { key: "third" });
  });
  expect(result.current.fields).toEqual({
    first: { content: ["Too long"] },
    third: { isChecked: ["Required"] },
  });
});

it("clears only the field errors of the key whose next write starts", async () => {
  api
    .mockRejectedValueOnce(new ApiClientError(422, "validation_failed", "Invalid", { content: ["Too long"] }))
    .mockRejectedValueOnce(new ApiClientError(422, "validation_failed", "Invalid", { isChecked: ["Required"] }))
    .mockResolvedValueOnce({ id: "item" });
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  await act(async () => {
    await result.current.mutate(input, { key: "first" });
    await result.current.mutate(input, { key: "second" });
  });
  expect(Object.keys(result.current.fields).sort()).toEqual(["first", "second"]);
  act(() => {
    void result.current.mutate(input, { key: "first" });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.fields).toEqual({ second: { isChecked: ["Required"] } });
});

it("releases a keyed queue when a write times out so the next write on the key runs", async () => {
  vi.useFakeTimers();
  try {
    const { api: realApi } = await vi.importActual<typeof import("./client")>("./client");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_path: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          })
      )
    );
    api
      .mockImplementationOnce((...args: Parameters<typeof realApi>) => realApi(...args))
      .mockResolvedValue({ id: "item" });
    const onError = vi.fn();
    const { result } = renderHook(() => useApiMutation(updateChecklistItem));
    act(() => {
      void result.current.mutate(input, { key: "item", onError });
      void result.current.mutate(input, { key: "item" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    });
    expect(api).toHaveBeenCalledOnce();
    expect(result.current.isPending).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(error).toHaveBeenCalledWith("The request timed out. Try again.");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "timeout" }));
    expect(api).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("does not report a throwing onSuccess as a failed save", async () => {
  api.mockResolvedValue({ id: "item" });
  const failure = new Error("callback bug");
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const onError = vi.fn();
  const onSettled = vi.fn();
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  await act(async () => {
    await result.current.mutate(input, {
      onSuccess: () => {
        throw failure;
      },
      onError,
      onSettled,
    });
  });
  expect(router.refresh).toHaveBeenCalledOnce();
  expect(logged).toHaveBeenCalledWith(expect.stringContaining("after the write committed"), failure);
  expect(error).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(onSettled).toHaveBeenCalledOnce();
  expect(result.current.fields).toEqual({});
  logged.mockRestore();
});

it("does not report a throwing onSuccess or waitForRefresh as a failed keyed save", async () => {
  api.mockResolvedValue({ id: "item" });
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const onError = vi.fn();
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  act(() => {
    void result.current.mutate(input, {
      key: "first",
      onSuccess: () => {
        throw new Error("callback bug");
      },
      onError,
    });
    void result.current.mutate(input, {
      key: "second",
      waitForRefresh: () => {
        throw new Error("wait bug");
      },
      onError,
    });
  });
  await act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  });
  expect(router.refresh).toHaveBeenCalledTimes(2);
  expect(logged).toHaveBeenCalledTimes(2);
  expect(error).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  logged.mockRestore();
});

it("keeps a keyed queue moving after a throwing onSuccess", async () => {
  api.mockResolvedValue({ id: "item" });
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  act(() => {
    void result.current.mutate(input, {
      key: "item",
      onSuccess: () => {
        throw new Error("callback bug");
      },
    });
    void result.current.mutate(input, { key: "item" });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api).toHaveBeenCalledTimes(2);
  logged.mockRestore();
});

it("does not report a rejecting waitForRefresh as a failed keyed save", async () => {
  api.mockResolvedValue({ id: "item" });
  const failure = new Error("props bug");
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const onError = vi.fn();
  const { result } = renderHook(() => useApiMutation(updateChecklistItem));
  act(() => {
    void result.current.mutate(input, { key: "item", waitForRefresh: () => Promise.reject(failure), onError });
  });
  await act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  });
  expect(logged).toHaveBeenCalledWith(expect.stringContaining("after the write committed"), failure);
  expect(error).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  logged.mockRestore();
});
