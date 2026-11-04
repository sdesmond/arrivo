import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({
  updateProfile: vi.fn().mockResolvedValue({}),
}));

vi.mock("./avatar-actions", () => ({
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/arrivo/form-section", () => ({
  Section: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Field: ({
    children,
    label,
    error,
    htmlFor,
  }: {
    children: React.ReactNode;
    label: string;
    htmlFor?: string;
    error?: string;
  }) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}));

import { ProfileIdentitySection } from "./identity-section";
import { updateProfile } from "./actions";
import { removeAvatar, uploadAvatar } from "./avatar-actions";
import { toast } from "sonner";
import type { UserProfile } from "@/data/types";

const baseUser: UserProfile = {
  id: "u1",
  name: "Alice",
  username: "alice",
  dateFormat: "MM/DD/YYYY",
  currency: "USD",
  distanceUnit: "imperial",
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
  warningThreshold: 80,
  dangerThreshold: 90,
  loyaltyNumbers: [],
  wishlistDestinations: [],
  companions: [],
};

describe("ProfileIdentitySection — name validation (AC7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows error and disables Save when name exceeds 100 chars", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProfileIdentitySection user={baseUser} />);
    const nameInput = screen.getByDisplayValue("Alice");
    await user.clear(nameInput);
    await user.type(nameInput, "A".repeat(101));
    expect(screen.getByRole("alert")).toHaveTextContent("Name must be 100 characters or fewer.");
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("clears error when name is corrected to 100 chars or fewer", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProfileIdentitySection user={baseUser} />);
    const nameInput = screen.getByDisplayValue("Alice");
    await user.clear(nameInput);
    await user.type(nameInput, "A".repeat(101));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.clear(nameInput);
    await user.type(nameInput, "Alice Smith");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
  });

  it("no error shown when name is exactly 100 chars", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProfileIdentitySection user={baseUser} />);
    const nameInput = screen.getByDisplayValue("Alice");
    await user.clear(nameInput);
    await user.type(nameInput, "A".repeat(100));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ProfileIdentitySection — username", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the current username in an editable field", () => {
    render(<ProfileIdentitySection user={baseUser} />);
    const usernameInput = screen.getByLabelText("Username");
    expect(usernameInput).toHaveValue("alice");
    expect(usernameInput).not.toHaveAttribute("readonly");
  });

  it("shows the validation error and disables Save for an invalid username", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProfileIdentitySection user={baseUser} />);
    const usernameInput = screen.getByLabelText("Username");
    await user.clear(usernameInput);
    await user.type(usernameInput, "al");
    expect(screen.getByRole("alert")).toHaveTextContent("Username must be 3–30 characters.");
    expect(usernameInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("treats a case-only change as unchanged", async () => {
    const user = userEvent.setup({ delay: null });
    const onDirtyChange = vi.fn();
    render(<ProfileIdentitySection user={baseUser} onDirtyChange={onDirtyChange} />);
    const usernameInput = screen.getByLabelText("Username");
    await user.clear(usernameInput);
    await user.type(usernameInput, "ALICE");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("saves a new username alongside the name and reports dirty state", async () => {
    const user = userEvent.setup({ delay: null });
    const onDirtyChange = vi.fn();
    render(<ProfileIdentitySection user={baseUser} onDirtyChange={onDirtyChange} />);
    const usernameInput = screen.getByLabelText("Username");
    await user.clear(usernameInput);
    await user.type(usernameInput, "alice.w");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateProfile).toHaveBeenCalledWith({ name: "Alice", username: "alice.w" });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("omits the username from the save when only the name changed", async () => {
    const user = userEvent.setup({ delay: null });
    const onDirtyChange = vi.fn();
    render(<ProfileIdentitySection user={baseUser} onDirtyChange={onDirtyChange} />);
    const nameInput = screen.getByDisplayValue("Alice");
    await user.type(nameInput, " Smith");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateProfile).toHaveBeenCalledWith({ name: "Alice Smith" });
  });

  it("toasts the server error when the username is taken", async () => {
    vi.mocked(updateProfile).mockResolvedValueOnce({ error: "That username is taken." });
    const user = userEvent.setup({ delay: null });
    render(<ProfileIdentitySection user={baseUser} />);
    const usernameInput = screen.getByLabelText("Username");
    await user.clear(usernameInput);
    await user.type(usernameInput, "bob");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(toast.error).toHaveBeenCalledWith("That username is taken.");
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });
});

const PHOTO_URL = "/api/storage/user-avatars/u1/old.webp";
const NEW_PHOTO_URL = "/api/storage/user-avatars/u1/new.webp";
const photoUser: UserProfile = { ...baseUser, image: PHOTO_URL };

function getFileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[type="file"]')!;
}

function chooseFile(input: HTMLInputElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

function pngFile(size?: number): File {
  const file = new File(["png"], "me.png", { type: "image/png" });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("ProfileIdentitySection — profile photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadAvatar).mockResolvedValue({ ok: true, image: NEW_PHOTO_URL });
    vi.mocked(removeAvatar).mockResolvedValue({ ok: true, image: null });
  });

  it("shows initials and an Upload photo button when there is no photo", () => {
    const { container } = render(<ProfileIdentitySection user={baseUser} />);

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("shows the photo with Replace and Remove buttons when one is set", () => {
    const { container } = render(<ProfileIdentitySection user={photoUser} />);

    expect(container.querySelector("img")).toHaveAttribute("src", PHOTO_URL);
    expect(screen.getByRole("button", { name: "Replace photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument();
  });

  it("falls back to initials when the stored photo fails to load", () => {
    const { container } = render(<ProfileIdentitySection user={photoUser} />);

    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("uses a visually hidden file input limited to the allowed types, opened by the button", async () => {
    const user = userEvent.setup({ delay: null });
    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    const { container } = render(<ProfileIdentitySection user={baseUser} />);
    const input = getFileInput(container);

    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(input).toHaveAttribute("tabindex", "-1");
    expect(input).toHaveAttribute("aria-hidden", "true");

    await user.click(screen.getByRole("button", { name: "Upload photo" }));
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("opens the chooser from the keyboard (Enter and Space)", async () => {
    const user = userEvent.setup({ delay: null });
    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    render(<ProfileIdentitySection user={baseUser} />);

    screen.getByRole("button", { name: "Upload photo" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });

  it("uploads the chosen file and shows the new photo", async () => {
    const { container } = render(<ProfileIdentitySection user={baseUser} />);
    const file = pngFile();

    chooseFile(getFileInput(container), file);

    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", NEW_PHOTO_URL));
    const sent = vi.mocked(uploadAvatar).mock.calls[0][0];
    expect(sent.get("file")).toBe(file);
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Replace photo" })).toBeInTheDocument();
  });

  it("clears the input so the same file can be chosen again", async () => {
    const { container } = render(<ProfileIdentitySection user={baseUser} />);
    const input = getFileInput(container);

    chooseFile(input, pngFile());

    await waitFor(() => expect(uploadAvatar).toHaveBeenCalled());
    expect(input.value).toBe("");
  });

  it("rejects a wrong file type client-side with a toast naming the types and limit", () => {
    const { container } = render(<ProfileIdentitySection user={baseUser} />);

    chooseFile(getFileInput(container), new File(["x"], "me.gif", { type: "image/gif" }));

    expect(toast.error).toHaveBeenCalledWith("Choose a JPG, PNG, or WEBP photo up to 5 MB.");
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("rejects a file over 5 MB client-side", () => {
    const { container } = render(<ProfileIdentitySection user={baseUser} />);

    chooseFile(getFileInput(container), pngFile(5 * 1024 * 1024 + 1));

    expect(toast.error).toHaveBeenCalledWith("Choose a JPG, PNG, or WEBP photo up to 5 MB.");
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("ignores an empty selection", () => {
    const { container } = render(<ProfileIdentitySection user={baseUser} />);

    fireEvent.change(getFileInput(container), { target: { files: [] } });

    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the server message and keeps the current photo when the upload is refused", async () => {
    vi.mocked(uploadAvatar).mockResolvedValue({ ok: false, error: "Couldn't read that image" });
    const { container } = render(<ProfileIdentitySection user={photoUser} />);

    chooseFile(getFileInput(container), pngFile());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't read that image"));
    expect(container.querySelector("img")).toHaveAttribute("src", PHOTO_URL);
  });

  it("shows a generic error when the upload action throws", async () => {
    vi.mocked(uploadAvatar).mockRejectedValue(new Error("db down"));
    const { container } = render(<ProfileIdentitySection user={baseUser} />);

    chooseFile(getFileInput(container), pngFile());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't update your photo. Try again."));
    expect(container.querySelector("img")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Upload photo" })).not.toHaveAttribute("aria-disabled", "true")
    );
  });

  it("shows a pending state, keeps focus on the button, and blocks a second pick while uploading", async () => {
    const user = userEvent.setup({ delay: null });
    let finish: (value: { ok: true; image: string }) => void = () => {};
    vi.mocked(uploadAvatar).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    const { container } = render(<ProfileIdentitySection user={baseUser} />);
    screen.getByRole("button", { name: "Upload photo" }).focus();

    chooseFile(getFileInput(container), pngFile());

    const pending = await screen.findByRole("button", { name: "Uploading…" });
    expect(pending).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(pending);
    await user.click(pending);
    expect(click).not.toHaveBeenCalled();

    await act(async () => finish({ ok: true, image: NEW_PHOTO_URL }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Replace photo" })).toBeInTheDocument());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Replace photo" }));
    click.mockRestore();
  });

  it("removes the photo, brings initials back, and moves focus to Upload photo", async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = render(<ProfileIdentitySection user={photoUser} />);

    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    await waitFor(() => expect(container.querySelector("img")).toBeNull());
    expect(removeAvatar).toHaveBeenCalledTimes(1);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Upload photo" }));
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
  });

  it("shows a pending state while removing", async () => {
    const user = userEvent.setup({ delay: null });
    let finish: (value: { ok: true; image: null }) => void = () => {};
    vi.mocked(removeAvatar).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ProfileIdentitySection user={photoUser} />);

    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(await screen.findByRole("button", { name: "Removing…" })).toHaveAttribute("aria-disabled", "true");
    await act(async () => finish({ ok: true, image: null }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Removing…" })).not.toBeInTheDocument());
  });

  it("keeps the photo and shows an error when removal fails", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(removeAvatar).mockRejectedValue(new Error("db down"));
    const { container } = render(<ProfileIdentitySection user={photoUser} />);

    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't remove your photo. Try again."));
    expect(container.querySelector("img")).toHaveAttribute("src", PHOTO_URL);
  });

  it("shows the server message when removal is refused", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(removeAvatar).mockResolvedValue({ ok: false, error: "Nope" });
    render(<ProfileIdentitySection user={photoUser} />);

    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nope"));
  });

  it("makes the photo large and puts the upload control inside the picture", () => {
    const { container } = render(<ProfileIdentitySection user={baseUser} />);

    const avatar = container.querySelector<HTMLElement>('[data-slot="profile-avatar"]')!;
    expect(avatar.style.width).toBe("144px");
    expect(avatar.style.height).toBe("144px");
    const upload = screen.getByRole("button", { name: "Upload photo" });
    expect(upload.parentElement).toContainElement(avatar);
    expect(upload.parentElement).toHaveStyle({ width: "144px", height: "144px" });
    expect(upload).toHaveClass("absolute", "inset-0", "rounded-full");
  });

  it("reveals the in-picture control on hover and keyboard focus, not at rest", () => {
    render(<ProfileIdentitySection user={photoUser} />);

    const replace = screen.getByRole("button", { name: "Replace photo" });
    expect(replace).toHaveClass("opacity-0", "hover:opacity-100", "focus-visible:opacity-100");
  });

  it("places Remove photo underneath the picture", () => {
    const { container } = render(<ProfileIdentitySection user={photoUser} />);

    const avatar = container.querySelector<HTMLElement>('[data-slot="profile-avatar"]')!;
    const remove = screen.getByRole("button", { name: "Remove photo" });
    expect(avatar.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(avatar.parentElement!.parentElement).toContainElement(remove);
    expect(avatar.parentElement).not.toContainElement(remove);
    expect(avatar.parentElement!.parentElement).toHaveClass("flex-col");
    // Column is exactly as wide as the photo and centers its children, so Remove sits centered under it.
    expect(avatar.parentElement!.parentElement).toHaveClass("items-center");
    expect(avatar.parentElement!.parentElement).toHaveStyle({ width: "144px" });
  });

  it("keeps the in-picture control visible while a photo is uploading", async () => {
    vi.mocked(uploadAvatar).mockReturnValue(new Promise(() => {}));
    const { container } = render(<ProfileIdentitySection user={baseUser} />);

    chooseFile(getFileInput(container), pngFile());

    expect(await screen.findByRole("button", { name: "Uploading…" })).toHaveClass("aria-disabled:opacity-100");
  });

  it("makes the in-picture control and the Remove button at least 44px", () => {
    render(<ProfileIdentitySection user={photoUser} />);

    // The in-picture control fills the 144px photo; Remove is a labelled h-11 button.
    expect(screen.getByRole("button", { name: "Replace photo" })).toHaveClass("inset-0");
    expect(screen.getByRole("button", { name: "Remove photo" })).toHaveClass("h-11");
  });
});
