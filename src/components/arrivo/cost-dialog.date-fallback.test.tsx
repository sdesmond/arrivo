import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockDateProvider } from "@/components/providers/mock-date-provider";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ value, onChange }: { value?: string; onChange: (nextDate?: string | null) => void }) => (
    <div>
      <button type="button">{value}</button>
      <button type="button" onClick={() => onChange(undefined)}>
        clear-date
      </button>
    </div>
  ),
}));

import { CostDialog } from "./cost-dialog";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO="2026-08-02T12:00:00.000Z">{children}</MockDateProvider>;
}

describe("CostDialog date fallback", () => {
  it("falls back to mocked current date when date picker clears", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CostDialog open onOpenChange={vi.fn()} onSave={onSave} />, { wrapper: Wrapper });

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "25");
    await user.click(screen.getByRole("button", { name: /select category/i }));
    await user.click(screen.getByRole("option", { name: "Food" }));
    await user.click(screen.getByRole("button", { name: "clear-date" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-08-02",
        })
      )
    );
  });
});
