// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/mock-date", () => ({
  setMockDate: vi.fn(),
}));

import { DevDatePicker } from "./dev-date-picker";
import { MockDateProvider } from "@/components/providers/mock-date-provider";

beforeEach(() => {
  vi.clearAllMocks();
});

const NOW_ISO = "2026-05-13T12:00:00.000Z";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

describe("DevDatePicker", () => {
  it("renders the toggle button in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<DevDatePicker />, { wrapper: Wrapper });
    expect(screen.getByTestId("dev-date-picker-toggle")).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("returns null outside development mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(<DevDatePicker />, { wrapper: Wrapper });
    expect(container).toBeEmptyDOMElement();
    vi.unstubAllEnvs();
  });

  it("shows date/time input when toggle is clicked", async () => {
    const user = userEvent.setup();
    vi.stubEnv("NODE_ENV", "development");
    render(<DevDatePicker />, { wrapper: Wrapper });
    await user.click(screen.getByTestId("dev-date-picker-toggle"));
    expect(screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}/)).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("Apply button calls setMockDate with ISO string", async () => {
    const user = userEvent.setup();
    const { setMockDate } = await import("@/lib/mock-date");
    vi.stubEnv("NODE_ENV", "development");
    render(<DevDatePicker />, { wrapper: Wrapper });
    await user.click(screen.getByTestId("dev-date-picker-toggle"));
    await user.click(screen.getByRole("button", { name: /apply/i }));
    expect(setMockDate).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("shows Clear button when mockISO is non-null", async () => {
    const user = userEvent.setup();
    vi.stubEnv("NODE_ENV", "development");
    render(<DevDatePicker />, { wrapper: Wrapper });
    await user.click(screen.getByTestId("dev-date-picker-toggle"));
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("Clear button calls setMockDate(null)", async () => {
    const user = userEvent.setup();
    const { setMockDate } = await import("@/lib/mock-date");
    vi.stubEnv("NODE_ENV", "development");
    render(<DevDatePicker />, { wrapper: Wrapper });
    await user.click(screen.getByTestId("dev-date-picker-toggle"));
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(setMockDate).toHaveBeenCalledWith(null);
    vi.unstubAllEnvs();
  });

  it("toggle button shows MOCKED label when isMocked", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<DevDatePicker />, { wrapper: Wrapper });
    expect(screen.getByTestId("dev-date-picker-toggle").textContent).toMatch(/MOCKED/);
    vi.unstubAllEnvs();
  });

  it("changing datetime-local input updates the input value", async () => {
    const user = userEvent.setup();
    vi.stubEnv("NODE_ENV", "development");
    render(<DevDatePicker />, { wrapper: Wrapper });
    await user.click(screen.getByTestId("dev-date-picker-toggle"));
    const input = screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}/);
    await user.clear(input);
    await user.type(input, "2026-07-04T10:00");
    expect(input).toHaveValue("2026-07-04T10:00");
    vi.unstubAllEnvs();
  });

  it("shows LIVE label when mockISO is null", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<DevDatePicker />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <MockDateProvider initialISO={null}>{children}</MockDateProvider>
      ),
    });
    expect(screen.getByTestId("dev-date-picker-toggle").textContent).toMatch(/LIVE/);
    vi.unstubAllEnvs();
  });

  it("Apply button does nothing when input is empty", async () => {
    const user = userEvent.setup();
    const { setMockDate } = await import("@/lib/mock-date");
    vi.stubEnv("NODE_ENV", "development");
    render(<DevDatePicker />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <MockDateProvider initialISO={null}>{children}</MockDateProvider>
      ),
    });
    await user.click(screen.getByTestId("dev-date-picker-toggle"));
    await user.click(screen.getByRole("button", { name: /apply/i }));
    expect(setMockDate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
