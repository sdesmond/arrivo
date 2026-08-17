import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertValidCoverUpload,
  assertValidDocumentUpload,
  COVER_UPLOAD_HINT,
  createUploadStorageName,
  DOCUMENT_UPLOAD_HINT,
  getUploadExtension,
} from "./upload-policy";

describe("upload-policy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports stable upload hint copy", () => {
    expect(DOCUMENT_UPLOAD_HINT).toBe("PDF, JPG, PNG, WEBP, HEIC · max 25 MB");
    expect(COVER_UPLOAD_HINT).toBe("JPG, PNG, WEBP, HEIC, GIF, AVIF · max 12 MB");
  });

  it("accepts supported document upload MIME types", () => {
    expect(() => assertValidDocumentUpload(new File(["x"], "doc.pdf", { type: "application/pdf" }))).not.toThrow();
    expect(() => assertValidDocumentUpload(new File(["x"], "photo.heic", { type: "image/heic" }))).not.toThrow();
    expect(() => assertValidDocumentUpload(new File(["x"], "photo.heif", { type: "image/heif" }))).not.toThrow();
  });

  it("rejects unsupported document upload MIME types", () => {
    expect(() => assertValidDocumentUpload(new File(["x"], "doc.docx", { type: "application/msword" }))).toThrow(
      "Unsupported file type. Choose PDF, JPG, PNG, WEBP, or HEIC."
    );
  });

  it("rejects oversized document uploads", () => {
    const file = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 25 * 1024 * 1024 + 1 });

    expect(() => assertValidDocumentUpload(file)).toThrow("File is too large. Max 25.0 MB.");
  });

  it("accepts supported cover upload MIME types", () => {
    expect(() => assertValidCoverUpload(new File(["x"], "cover.png", { type: "image/png" }))).not.toThrow();
    expect(() => assertValidCoverUpload(new File(["x"], "cover.avif", { type: "image/avif" }))).not.toThrow();
    expect(() => assertValidCoverUpload(new File(["x"], "cover.heif", { type: "image/heif" }))).not.toThrow();
  });

  it("rejects unsupported cover upload MIME types", () => {
    expect(() => assertValidCoverUpload(new File(["x"], "cover.svg", { type: "image/svg+xml" }))).toThrow(
      "Unsupported cover image type. Choose JPG, PNG, WEBP, HEIC, GIF, or AVIF."
    );
  });

  it("rejects oversized cover uploads", () => {
    const file = new File(["x"], "cover.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 12 * 1024 * 1024 + 1 });

    expect(() => assertValidCoverUpload(file)).toThrow("Cover image exceeds 12 MB limit.");
  });

  it("maps supported MIME types to stable extensions", () => {
    expect(getUploadExtension("application/pdf")).toBe("pdf");
    expect(getUploadExtension("image/jpeg")).toBe("jpg");
    expect(getUploadExtension("image/heic")).toBe("heic");
    expect(getUploadExtension("image/heif")).toBe("heic");
  });

  it("throws for unknown MIME type extension lookups", () => {
    expect(() => getUploadExtension("text/plain")).toThrow("Unsupported upload MIME type: text/plain");
  });

  it("builds storage names from scope, owner, UUID, and MIME extension", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1234");

    expect(createUploadStorageName("trip-document", "trip-1", "application/pdf")).toBe(
      "trip-documents/trip-1/uuid-1234.pdf"
    );
    expect(createUploadStorageName("event-document", "event-1", "image/png")).toBe(
      "event-documents/event-1/uuid-1234.png"
    );
    expect(createUploadStorageName("reservation-document", "res-1", "image/heif")).toBe(
      "reservation-documents/res-1/uuid-1234.heic"
    );
    expect(createUploadStorageName("trip-cover", "trip-1", "image/avif")).toBe("trip-covers/trip-1/uuid-1234.avif");
  });
});
