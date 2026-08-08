import { describe, it, expect } from "vitest";
import { getNoteTitle, getNotePreviewLine } from "@/lib/note-preview";

describe("getNoteTitle", () => {
  it("uses the trimmed title when present", () => {
    expect(getNoteTitle({ title: "  Pack sunscreen  ", body: "Reef-safe only" })).toBe("Pack sunscreen");
  });

  it("falls back to the first non-empty body line when title is blank", () => {
    expect(getNoteTitle({ title: "", body: "Buy tickets\nAt the gate" })).toBe("Buy tickets");
  });

  it("falls back to the first non-empty body line when title is whitespace-only", () => {
    expect(getNoteTitle({ title: "   ", body: "Buy tickets" })).toBe("Buy tickets");
  });

  it("falls back to the first non-empty body line when title is undefined", () => {
    expect(getNoteTitle({ title: undefined, body: "Buy tickets" })).toBe("Buy tickets");
  });

  it("skips leading blank lines in the body", () => {
    expect(getNoteTitle({ title: "", body: "\n\n  \nBuy tickets\nSecond line" })).toBe("Buy tickets");
  });

  it("returns empty string when both title and body are blank", () => {
    expect(getNoteTitle({ title: "", body: "" })).toBe("");
  });

  it("returns empty string when both title and body are undefined", () => {
    expect(getNoteTitle({ title: undefined, body: undefined })).toBe("");
  });

  it("returns empty string when body is only whitespace lines", () => {
    expect(getNoteTitle({ title: "", body: "  \n   \n" })).toBe("");
  });
});

describe("getNotePreviewLine", () => {
  it("uses the first non-empty body line when body is present", () => {
    expect(getNotePreviewLine({ title: "Pack sunscreen", body: "Reef-safe only\nGet it at the airport" })).toBe(
      "Reef-safe only"
    );
  });

  it("falls back to the title when body has no non-empty lines", () => {
    expect(getNotePreviewLine({ title: "Pack sunscreen", body: "" })).toBe("Pack sunscreen");
  });

  it("falls back to the title when body is undefined", () => {
    expect(getNotePreviewLine({ title: "Pack sunscreen", body: undefined })).toBe("Pack sunscreen");
  });

  it("falls back to the title when body is only whitespace lines", () => {
    expect(getNotePreviewLine({ title: "Pack sunscreen", body: "\n  \n" })).toBe("Pack sunscreen");
  });

  it("skips leading blank lines before finding the preview line", () => {
    expect(getNotePreviewLine({ title: "", body: "\n\nFirst real line\nSecond line" })).toBe("First real line");
  });

  it("returns empty string when title and body are both blank", () => {
    expect(getNotePreviewLine({ title: "", body: "" })).toBe("");
  });
});
