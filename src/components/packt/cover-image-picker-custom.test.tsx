import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GRAPHIC_COVER_COLORS, GRAPHIC_COVER_ICONS } from "@/lib/utils";
import { CoverImagePickerCustom } from "./cover-image-picker-custom";

vi.mock("lucide-react", () => {
  function makeIcon(name: string) {
    const FakeIcon = ({ style, ...rest }: { style?: React.CSSProperties; [k: string]: unknown }) => (
      <span data-testid={`icon-${name}`} style={style} {...rest} />
    );
    FakeIcon.displayName = name;
    return FakeIcon;
  }

  return {
    Plane: makeIcon("Plane"),
    Map: makeIcon("Map"),
    Compass: makeIcon("Compass"),
    Camera: makeIcon("Camera"),
    TentTree: makeIcon("TentTree"),
    Ship: makeIcon("Ship"),
    Backpack: makeIcon("Backpack"),
    Luggage: makeIcon("Luggage"),
    Bus: makeIcon("Bus"),
    Car: makeIcon("Car"),
    Mountain: makeIcon("Mountain"),
    TreePalm: makeIcon("TreePalm"),
    Hotel: makeIcon("Hotel"),
    Road: makeIcon("Road"),
    Van: makeIcon("Van"),
    Caravan: makeIcon("Caravan"),
    MapPin: makeIcon("MapPin"),
    MapPinned: makeIcon("MapPinned"),
    Trees: makeIcon("Trees"),
  };
});

describe("CoverImagePickerCustom", () => {
  it("renders one color option per graphic cover color", () => {
    render(<CoverImagePickerCustom onImageSelected={vi.fn()} onClose={vi.fn()} />);

    const colorSelect = screen.getByLabelText(/background color/i);

    expect(colorSelect).toHaveValue(GRAPHIC_COVER_COLORS[0]);
    expect(within(colorSelect).getAllByRole("option")).toHaveLength(GRAPHIC_COVER_COLORS.length);
  });

  it("renders one icon option per graphic cover icon", () => {
    render(<CoverImagePickerCustom onImageSelected={vi.fn()} onClose={vi.fn()} />);

    const iconSelect = screen.getByLabelText(/^icon$/i);

    expect(iconSelect).toHaveValue(GRAPHIC_COVER_ICONS[0]);
    expect(within(iconSelect).getAllByRole("option")).toHaveLength(GRAPHIC_COVER_ICONS.length);
  });

  it("renders the preview card", () => {
    render(<CoverImagePickerCustom onImageSelected={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByTestId("cover-preview")).toBeInTheDocument();
  });

  it("updates the preview background when the color changes", async () => {
    const user = userEvent.setup();
    render(<CoverImagePickerCustom onImageSelected={vi.fn()} onClose={vi.fn()} />);

    const preview = screen.getByTestId("cover-preview");
    expect(preview).toHaveStyle({ background: GRAPHIC_COVER_COLORS[0] });

    await user.selectOptions(screen.getByLabelText(/background color/i), GRAPHIC_COVER_COLORS[2]);

    expect(preview).toHaveStyle({ background: GRAPHIC_COVER_COLORS[2] });
  });

  it("updates the preview icon when the icon changes", async () => {
    const user = userEvent.setup();
    render(<CoverImagePickerCustom onImageSelected={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByTestId("icon-Plane")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^icon$/i), GRAPHIC_COVER_ICONS[4]);

    expect(screen.queryByTestId("icon-Plane")).not.toBeInTheDocument();
    expect(screen.getByTestId("icon-TentTree")).toBeInTheDocument();
  });

  it("applies the selected graphic cover and closes the picker", async () => {
    const user = userEvent.setup();
    const onImageSelected = vi.fn();
    const onClose = vi.fn();

    render(<CoverImagePickerCustom onImageSelected={onImageSelected} onClose={onClose} />);

    await user.selectOptions(screen.getByLabelText(/background color/i), GRAPHIC_COVER_COLORS[3]);
    await user.selectOptions(screen.getByLabelText(/^icon$/i), GRAPHIC_COVER_ICONS[6]);
    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(onImageSelected).toHaveBeenCalledWith(`graphic:${GRAPHIC_COVER_COLORS[3]}/${GRAPHIC_COVER_ICONS[6]}`);
    expect(onClose).toHaveBeenCalled();
  });
});
