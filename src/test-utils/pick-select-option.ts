import { screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import type { UserEvent } from "@testing-library/user-event";

// Base UI's Select hands focus back to its trigger a moment after it closes. Typing before that lands
// loses keystrokes mid-word on a slow machine (a CI runner), so wait for the handoff to finish.
export async function pickSelectOption(
  user: UserEvent,
  triggerName: RegExp,
  optionName: string | RegExp
): Promise<void> {
  const trigger = screen.getByRole("button", { name: triggerName });

  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: optionName }));
  await waitFor(() => expect(trigger).toHaveFocus());
}
