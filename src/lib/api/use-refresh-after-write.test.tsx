import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { useRefreshAfterWrite } from "./use-refresh-after-write";

function Probe({ onReady }: { onReady: (run: () => void) => void }) {
  onReady(useRefreshAfterWrite());
  return null;
}

describe("useRefreshAfterWrite", () => {
  it("refreshes the route once per call, one after another", async () => {
    let run!: () => void;
    render(<Probe onReady={(next) => (run = next)} />);
    run();
    run();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it("releases queued refreshes when the component unmounts", async () => {
    refresh.mockClear();
    let run!: () => void;
    const { unmount } = render(<Probe onReady={(next) => (run = next)} />);
    run();
    unmount();
    run();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it("does not stall the shared queue when called after unmount", async () => {
    refresh.mockClear();
    let runFirst!: () => void;
    const first = render(<Probe onReady={(next) => (runFirst = next)} />);
    first.unmount();
    runFirst();
    let runSecond!: () => void;
    render(<Probe onReady={(next) => (runSecond = next)} />);
    runSecond();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });
});
