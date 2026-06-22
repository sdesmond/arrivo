import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PendingSyncBadge } from "./pending-sync-badge";

describe("PendingSyncBadge", () => {
  it("renders pending state with persistent aria-label", () => {
    render(<PendingSyncBadge syncStatus="pending" />);

    expect(screen.getByLabelText("Pending sync")).toBeInTheDocument();
    expect(screen.getByText("Sync pending")).toBeInTheDocument();
  });

  it("renders nothing for synced state", () => {
    const { container } = render(<PendingSyncBadge syncStatus="synced" />);

    expect(container).toBeEmptyDOMElement();
  });
});
