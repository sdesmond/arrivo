import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProfileAvatar } from "./profile-avatar";

const PHOTO = "/api/storage/user-avatars/user-1/a.webp";

function getAvatar(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[data-slot="profile-avatar"]')!;
}

describe("ProfileAvatar", () => {
  it("shows the photo with empty alt text and no initials when an image is set", () => {
    const { container } = render(<ProfileAvatar image={PHOTO} initials="AL" size={56} />);

    const photo = container.querySelector("img")!;
    expect(photo).toHaveAttribute("src", PHOTO);
    expect(photo).toHaveAttribute("alt", "");
    expect(screen.queryByText("AL")).not.toBeInTheDocument();
  });

  it.each([undefined, null, ""])("shows initials when image is %j", (image) => {
    const { container } = render(<ProfileAvatar image={image} initials="AL" size={56} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("falls back to initials when the photo fails to load", () => {
    const { container } = render(<ProfileAvatar image={PHOTO} initials="AL" size={56} />);

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("tries a new photo URL after an earlier one failed", () => {
    const { container, rerender } = render(<ProfileAvatar image={PHOTO} initials="AL" size={56} />);
    fireEvent.error(container.querySelector("img")!);

    rerender(<ProfileAvatar image="/api/storage/user-avatars/user-1/b.webp" initials="AL" size={56} />);

    expect(container.querySelector("img")).toHaveAttribute("src", "/api/storage/user-avatars/user-1/b.webp");
  });

  it.each([22, 28, 56])("renders a %ipx circle", (size) => {
    const { container } = render(<ProfileAvatar initials="AL" size={size} />);

    const avatar = getAvatar(container);
    expect(avatar.style.width).toBe(`${size}px`);
    expect(avatar.style.height).toBe(`${size}px`);
    expect(avatar).toHaveClass("rounded-full");
  });

  it("scales the initials font with size unless a font size is given", () => {
    const { container, rerender } = render(<ProfileAvatar initials="AL" size={50} />);
    expect(getAvatar(container).style.fontSize).toBe("20px");

    rerender(<ProfileAvatar initials="AL" size={50} fontSize="calc(12px * var(--font-scale))" />);
    expect(getAvatar(container).style.fontSize).toBe("calc(12px * var(--font-scale))");
  });

  it("uses the given tint, or the initials tint by default", () => {
    const { container, rerender } = render(
      <ProfileAvatar initials="AL" size={28} tint={{ bg: "var(--surface-2)", color: "var(--fg)" }} />
    );
    expect(getAvatar(container).style.background).toBe("var(--surface-2)");
    expect(getAvatar(container).style.color).toBe("var(--fg)");

    rerender(<ProfileAvatar initials="AL" size={28} />);
    expect(getAvatar(container).style.background).toContain("oklch");
  });

  it("merges className and style from the caller", () => {
    const { container } = render(
      <ProfileAvatar
        initials="AL"
        size={28}
        className="extra"
        style={{ marginLeft: -7, border: "2px solid var(--bg)" }}
      />
    );

    const avatar = getAvatar(container);
    expect(avatar).toHaveClass("extra");
    expect(avatar.style.marginLeft).toBe("-7px");
  });
});
