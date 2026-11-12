// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertValidAvatarUpload,
  assertValidCoverUpload,
  assertUploadContentMatchesType,
  assertValidDocumentUpload,
  AVATAR_UPLOAD_ACCEPT,
  AVATAR_UPLOAD_HINT,
  AVATAR_UPLOAD_REJECTED_MESSAGE,
  COVER_UPLOAD_HINT,
  createUploadStorageName,
  DOCUMENT_UPLOAD_HINT,
  EXTENSION_MIME_TYPES,
  getMimeTypeForExtension,
  getUploadExtension,
  getUploadScopePrefix,
  parseUploadStorageName,
  UPLOAD_SCOPE_PREFIX_REVERSE,
  UPLOAD_SCOPE_PREFIXES,
  UploadInvalidError,
  UploadTooLargeError,
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

  it("throws typed errors for document and cover policy failures", () => {
    const wrongType = new File(["x"], "doc.docx", { type: "application/msword" });
    expect(() => assertValidDocumentUpload(wrongType)).toThrow(UploadInvalidError);
    const oversizeDocument = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(oversizeDocument, "size", { value: 25 * 1024 * 1024 + 1 });
    expect(() => assertValidDocumentUpload(oversizeDocument)).toThrow(UploadTooLargeError);
    expect(() => assertValidCoverUpload(new File(["x"], "cover.svg", { type: "image/svg+xml" }))).toThrow(
      UploadInvalidError
    );
    const oversizeCover = new File(["x"], "cover.png", { type: "image/png" });
    Object.defineProperty(oversizeCover, "size", { value: 12 * 1024 * 1024 + 1 });
    expect(() => assertValidCoverUpload(oversizeCover)).toThrow(UploadTooLargeError);
  });

  it("throws a typed error when the contents do not match the claimed type", async () => {
    const html = new File(["<html></html>"], "fake.pdf", { type: "application/pdf" });
    await expect(assertUploadContentMatchesType(html)).rejects.toBeInstanceOf(UploadInvalidError);
    const unknown = new File(["x"], "a.bin", { type: "application/x-unknown" });
    await expect(assertUploadContentMatchesType(unknown)).rejects.toBeInstanceOf(UploadInvalidError);
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

  it("accepts JPEG, PNG, and WebP avatar uploads", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(() => assertValidAvatarUpload(new File(["x"], "me", { type }))).not.toThrow();
    }
  });

  it.each(["image/heic", "image/gif", "image/avif", "image/svg+xml", "application/pdf", ""])(
    "rejects %s avatar uploads",
    (type) => {
      expect(() => assertValidAvatarUpload(new File(["x"], "me", { type }))).toThrow(
        "Unsupported photo type. Choose JPG, PNG, or WEBP."
      );
    }
  );

  it("rejects avatar uploads over 5 MB and accepts exactly 5 MB", () => {
    const atLimit = new File(["x"], "me.png", { type: "image/png" });
    Object.defineProperty(atLimit, "size", { value: 5 * 1024 * 1024 });
    expect(() => assertValidAvatarUpload(atLimit)).not.toThrow();

    const over = new File(["x"], "me.png", { type: "image/png" });
    Object.defineProperty(over, "size", { value: 5 * 1024 * 1024 + 1 });
    expect(() => assertValidAvatarUpload(over)).toThrow("Photo is too large. Max 5 MB.");
  });

  it("exports avatar accept list and hint", () => {
    expect(AVATAR_UPLOAD_ACCEPT).toBe("image/jpeg,image/png,image/webp");
    expect(AVATAR_UPLOAD_HINT).toBe("JPG, PNG, WEBP · max 5 MB");
    expect(AVATAR_UPLOAD_REJECTED_MESSAGE).toBe("Choose a JPG, PNG, or WEBP photo up to 5 MB.");
  });

  it("builds and parses user-avatar storage names", () => {
    const name = createUploadStorageName("user-avatar", "user-1", "image/webp");
    expect(name).toMatch(/^user-avatars\/user-1\/[0-9a-f-]+\.webp$/);
    expect(parseUploadStorageName(name)).toMatchObject({ scope: "user-avatar", ownerId: "user-1" });
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

  it("exports UPLOAD_SCOPE_PREFIXES with a reverse map that round-trips every scope", () => {
    for (const [scope, prefix] of Object.entries(UPLOAD_SCOPE_PREFIXES)) {
      expect(UPLOAD_SCOPE_PREFIX_REVERSE[prefix]).toBe(scope);
    }
  });

  it("getUploadScopePrefix returns the plural prefix for a scope", () => {
    expect(getUploadScopePrefix("trip-document")).toBe("trip-documents");
    expect(getUploadScopePrefix("event-document")).toBe("event-documents");
    expect(getUploadScopePrefix("reservation-document")).toBe("reservation-documents");
    expect(getUploadScopePrefix("trip-cover")).toBe("trip-covers");
  });

  it("parseUploadStorageName parses a valid key into scope, ownerId, and filename", () => {
    expect(parseUploadStorageName("event-documents/abc-123/uuid-456.jpg")).toEqual({
      scope: "event-document",
      ownerId: "abc-123",
      filename: "uuid-456.jpg",
    });
    expect(parseUploadStorageName("trip-covers/trip-1/uuid-9.png")).toEqual({
      scope: "trip-cover",
      ownerId: "trip-1",
      filename: "uuid-9.png",
    });
  });

  it("parseUploadStorageName throws on a key with the wrong number of segments", () => {
    expect(() => parseUploadStorageName("event-documents/abc-123")).toThrow();
    expect(() => parseUploadStorageName("event-documents/abc-123/uuid-456.jpg/extra")).toThrow();
  });

  it("parseUploadStorageName throws on an unrecognized scope prefix", () => {
    expect(() => parseUploadStorageName("not-a-scope/abc-123/uuid-456.jpg")).toThrow();
  });

  it("parseUploadStorageName throws on path traversal segments", () => {
    expect(() => parseUploadStorageName("event-documents/../etc/passwd/uuid.jpg")).toThrow();
    expect(() => parseUploadStorageName("event-documents/abc-123/../../../etc/shadow")).toThrow();
    expect(() => parseUploadStorageName("event-documents/abc-123/null\x00byte.jpg")).toThrow();
  });

  it("exports EXTENSION_MIME_TYPES as the reverse of the MIME→extension map, using canonical HEIC", () => {
    expect(EXTENSION_MIME_TYPES).toEqual({
      pdf: "application/pdf",
      avif: "image/avif",
      gif: "image/gif",
      heic: "image/heic",
      jpg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    });
  });

  it("getMimeTypeForExtension returns the MIME type for a known extension", () => {
    expect(getMimeTypeForExtension("pdf")).toBe("application/pdf");
    expect(getMimeTypeForExtension("jpg")).toBe("image/jpeg");
    expect(getMimeTypeForExtension("heic")).toBe("image/heic");
  });

  it("getMimeTypeForExtension throws for an unknown extension", () => {
    expect(() => getMimeTypeForExtension("exe")).toThrow("Unsupported storage file extension: exe");
  });
});

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));
const bytesFile = (bytes: number[], type: string, name = "upload.bin") =>
  new File([new Uint8Array(bytes)], name, { type });
const isoBmff = (brand: string) => [0, 0, 0, 24, ...ascii("ftyp"), ...ascii(brand), 0, 0, 0, 0, ...ascii("mif1")];
const SIGNATURES: Record<string, number[]> = {
  "application/pdf": ascii("%PDF-1.7 "),
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0, 0, 0x10],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0],
  "image/gif": ascii("GIF89a"),
  "image/webp": [...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBPVP8 ")],
  "image/heic": isoBmff("heic"),
  "image/heif": isoBmff("heic"),
  "image/avif": isoBmff("avif"),
};

describe("assertUploadContentMatchesType", () => {
  it.each(Object.entries(SIGNATURES))("accepts real %s bytes", async (type, bytes) => {
    await expect(assertUploadContentMatchesType(bytesFile(bytes, type))).resolves.toBeUndefined();
  });

  it.each([
    ["a UTF-8 BOM", [0xef, 0xbb, 0xbf, ...ascii("%PDF-1.4")]],
    ["blank lines", [10, 13, 10, ...ascii("%PDF-1.4")]],
    ["a BOM and blank lines", [0xef, 0xbb, 0xbf, 13, 10, ...ascii("%PDF-1.4")]],
    ["NUL padding", [0, 0, 0, ...ascii("%PDF-1.7")]],
  ])("accepts a PDF with %s before the header", async (_label, bytes) => {
    await expect(assertUploadContentMatchesType(bytesFile(bytes, "application/pdf"))).resolves.toBeUndefined();
  });

  it.each([
    ["an HTML comment carrying the marker", ascii("<!-- %PDF-1.4 --><script>alert(1)</script>")],
    ["text before the header", ascii("junk %PDF-1.4")],
    ["the marker deep in the file", [...ascii("<html>".padEnd(500, " ")), ...ascii("%PDF-1.4")]],
    ["too much filler before the header", [...Array.from({ length: 17 }, () => 0x20), ...ascii("%PDF-1.4")]],
    ["a header that is only %PDF", ascii("%PDF")],
  ])("rejects a PDF claim backed by %s", async (_label, bytes) => {
    await expect(assertUploadContentMatchesType(bytesFile(bytes, "application/pdf"))).rejects.toThrow(
      "File contents don't match its type."
    );
  });

  it.each(["heic", "heix", "hevc", "mif1", "msf1"])("accepts the %s brand as HEIC", async (brand) => {
    await expect(assertUploadContentMatchesType(bytesFile(isoBmff(brand), "image/heic"))).resolves.toBeUndefined();
  });

  it("accepts the avis brand as AVIF", async () => {
    await expect(assertUploadContentMatchesType(bytesFile(isoBmff("avis"), "image/avif"))).resolves.toBeUndefined();
  });

  it.each([
    ["HTML named .png", ascii("<html><script>alert(1)</script>"), "image/png"],
    ["plain text claiming PDF", ascii("just some words"), "application/pdf"],
    ["a PNG claiming JPEG", SIGNATURES["image/png"], "image/jpeg"],
    ["a JPEG claiming PDF", SIGNATURES["image/jpeg"], "application/pdf"],
    ["an SVG claiming PNG", ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/png"],
    ["a RIFF WAV claiming WEBP", [...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVEfmt ")], "image/webp"],
    ["an AVIF claiming HEIC", isoBmff("avif"), "image/heic"],
    ["a HEIC claiming AVIF", isoBmff("heic"), "image/avif"],
    ["an empty file", [], "image/jpeg"],
    ["a file shorter than its signature", [0x89, 0x50], "image/png"],
    ["bytes under an unknown type", ascii("MZ"), "application/x-msdownload"],
  ])("rejects %s", async (_label, bytes, type) => {
    await expect(assertUploadContentMatchesType(bytesFile(bytes, type))).rejects.toThrow(
      "File contents don't match its type."
    );
  });

  it("only reads the start of a large file", async () => {
    const file = bytesFile(SIGNATURES["image/png"], "image/png");
    const slice = vi.spyOn(file, "slice");
    await assertUploadContentMatchesType(file);
    expect(slice).toHaveBeenCalledWith(0, expect.any(Number));
    expect(slice.mock.calls[0][1]).toBeLessThanOrEqual(4096);
  });
});
