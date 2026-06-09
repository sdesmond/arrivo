import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripCover } from "./trip-cover";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("lucide-react", () => ({
  Plane: () => <svg data-testid="lucide-plane" />,
}));

describe("TripCover", () => {
  it("renders the gradient fallback when no cover image url is provided", () => {
    const { container } = render(<TripCover name="Tokyo" />);

    expect(container.querySelector(".cover-stripes")).toBeInTheDocument();
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("renders a full-bleed image when coverImageUrl is a standard url", () => {
    render(<TripCover name="Tokyo" coverImageUrl="https://images.example.com/tokyo.jpg" />);

    const image = screen.getByRole("presentation");
    expect(image).toHaveAttribute("src", "https://images.example.com/tokyo.jpg");
    expect(image).toHaveStyle({ objectFit: "cover" });
    expect(document.querySelector(".cover-stripes")).not.toBeInTheDocument();
  });

  it("renders a full-bleed image when coverImageUrl is a relative path (e.g. Mapbox proxy tile)", () => {
    render(<TripCover name="Tokyo" coverImageUrl="/api/mapbox/static?lng=2.347&lat=48.859" />);

    const image = screen.getByRole("presentation");
    expect(image).toHaveAttribute("src", "/api/mapbox/static?lng=2.347&lat=48.859");
    expect(image).toHaveStyle({ objectFit: "cover" });
    expect(document.querySelector(".cover-stripes")).not.toBeInTheDocument();
  });

  it("renders a graphic cover when coverImageUrl uses the graphic prefix", () => {
    const { container } = render(<TripCover name="Tokyo" coverImageUrl="graphic:var(--accent-brand)/plane" />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("lucide-plane")).toBeInTheDocument();
    expect(document.querySelector(".cover-stripes")).not.toBeInTheDocument();
  });

  it("falls back to the gradient cover when the image fails to load", () => {
    render(<TripCover name="Tokyo" coverImageUrl="https://images.example.com/broken.jpg" />);

    fireEvent.error(screen.getByRole("presentation"));

    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(document.querySelector(".cover-stripes")).toBeInTheDocument();
  });

  it("shows the destination country in the text overlay when destinationName is not provided", () => {
    render(<TripCover name="Tokyo" country="3 DAYS" destinationCountry="Japan" />);

    expect(screen.getByText("Japan")).toBeInTheDocument();
    expect(screen.queryByText("3 DAYS")).not.toBeInTheDocument();
  });

  it("prefers destinationName over destinationCountry in the text overlay", () => {
    render(<TripCover name="Osaka" country="3 DAYS" destinationName="Tokyo, Japan" destinationCountry="Japan" />);

    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.queryByText("Japan")).not.toBeInTheDocument();
  });

  it("shows only the city portion of destinationName in the text overlay", () => {
    render(<TripCover name="Osaka" country="3 DAYS" destinationName="Branson, Missouri, United States" />);

    expect(screen.getByText("Branson")).toBeInTheDocument();
    expect(screen.queryByText("Missouri")).not.toBeInTheDocument();
    expect(screen.queryByText("United States")).not.toBeInTheDocument();
  });
});
