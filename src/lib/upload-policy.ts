import { formatFileSize, MAX_AVATAR_UPLOAD_BYTES, MAX_COVER_IMAGE_UPLOAD_BYTES, MAX_UPLOAD_BYTES } from "@/lib/utils";

export const DOCUMENT_UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic";
export const DOCUMENT_UPLOAD_CHOOSER_LABEL = "Choose file (PDF, JPG, PNG, WEBP, HEIC)";
export const DOCUMENT_UPLOAD_HINT = "PDF, JPG, PNG, WEBP, HEIC · max 25 MB";

export const COVER_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/avif";
export const COVER_UPLOAD_HINT = "JPG, PNG, WEBP, HEIC, GIF, AVIF · max 12 MB";

export const AVATAR_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp";
export const AVATAR_UPLOAD_HINT = "JPG, PNG, WEBP · max 5 MB";
export const AVATAR_UPLOAD_REJECTED_MESSAGE = "Choose a JPG, PNG, or WEBP photo up to 5 MB.";

export const AVATAR_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const DOCUMENT_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const COVER_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/avif",
] as const;

const DOCUMENT_UPLOAD_MIME_TYPE_SET = new Set<string>(DOCUMENT_UPLOAD_MIME_TYPES);
const COVER_UPLOAD_MIME_TYPE_SET = new Set<string>(COVER_UPLOAD_MIME_TYPES);
const AVATAR_UPLOAD_MIME_TYPE_SET = new Set<string>(AVATAR_UPLOAD_MIME_TYPES);

const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const DOCUMENT_UPLOAD_TYPE_ERROR = "Unsupported file type. Choose PDF, JPG, PNG, WEBP, or HEIC.";
const AVATAR_UPLOAD_TYPE_ERROR = "Unsupported photo type. Choose JPG, PNG, or WEBP.";
const COVER_UPLOAD_TYPE_ERROR = "Unsupported cover image type. Choose JPG, PNG, WEBP, HEIC, GIF, or AVIF.";

export class MalformedKeyError extends Error {
  constructor(key: string) {
    super(`Malformed upload storage name: ${key}`);
    this.name = "MalformedKeyError";
  }
}

export type UploadScope = "trip-document" | "event-document" | "reservation-document" | "trip-cover" | "user-avatar";

export const UPLOAD_SCOPE_PREFIXES: Record<UploadScope, string> = {
  "event-document": "event-documents",
  "reservation-document": "reservation-documents",
  "trip-cover": "trip-covers",
  "trip-document": "trip-documents",
  "user-avatar": "user-avatars",
};

export const UPLOAD_SCOPE_PREFIX_REVERSE: Record<string, UploadScope> = Object.fromEntries(
  Object.entries(UPLOAD_SCOPE_PREFIXES).map(([scope, prefix]) => [prefix, scope as UploadScope])
);

export function getUploadScopePrefix(scope: UploadScope): string {
  return UPLOAD_SCOPE_PREFIXES[scope];
}

export interface ParsedUploadStorageName {
  scope: UploadScope;
  ownerId: string;
  filename: string;
}

function hasPathTraversal(segment: string): boolean {
  return (
    segment === ".." || segment === "." || segment.includes("/") || segment.includes("\\") || segment.includes("\0")
  );
}

export function parseUploadStorageName(key: string): ParsedUploadStorageName {
  const segments = key.split("/");

  if (segments.length !== 3) {
    throw new MalformedKeyError(key);
  }

  const [prefix, ownerId, filename] = segments;
  const scope = UPLOAD_SCOPE_PREFIX_REVERSE[prefix];

  if (!scope || !ownerId || !filename) {
    throw new MalformedKeyError(key);
  }

  if (hasPathTraversal(ownerId) || hasPathTraversal(filename)) {
    throw new MalformedKeyError(key);
  }

  return { scope, ownerId, filename };
}

export function assertValidDocumentUpload(file: File): void {
  if (!DOCUMENT_UPLOAD_MIME_TYPE_SET.has(file.type)) {
    throw new Error(DOCUMENT_UPLOAD_TYPE_ERROR);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large. Max ${formatFileSize(MAX_UPLOAD_BYTES)}.`);
  }
}

// The browser's `file.type` is only a claim from the uploader. Read the file's first bytes and require the format
// they show to be the one claimed, so an HTML or script file can't be stored and served under an image or PDF type.
const SIGNATURE_READ_BYTES = 1024;
const CONTENT_MISMATCH_ERROR = "File contents don't match its type.";
const ISO_BMFF_SHARED_BRANDS = ["mif1", "msf1"];
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", ...ISO_BMFF_SHARED_BRANDS];
const AVIF_BRANDS = ["avif", "avis", ...ISO_BMFF_SHARED_BRANDS];

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function startsWithBytes(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function hasIsoBmffBrand(bytes: Uint8Array, brands: string[]): boolean {
  return asciiAt(bytes, 4, 4) === "ftyp" && brands.includes(asciiAt(bytes, 8, 4));
}

// Readers tolerate junk before the header, but a header buried in a comment is how a script or HTML file passes as a
// PDF. Allow only what real writers emit ahead of it: a UTF-8 BOM and a few whitespace or NUL bytes.
const PDF_LEADING_BYTES_MAX = 16;
const PDF_LEADING_FILLER = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);

function startsWithPdfHeader(bytes: Uint8Array): boolean {
  let offset = startsWithBytes(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  const limit = Math.min(bytes.length, PDF_LEADING_BYTES_MAX);
  while (offset < limit && PDF_LEADING_FILLER.has(bytes[offset])) offset += 1;
  return asciiAt(bytes, offset, 5) === "%PDF-";
}

const CONTENT_SIGNATURE_CHECKS: Record<string, (bytes: Uint8Array) => boolean> = {
  "application/pdf": startsWithPdfHeader,
  "image/jpeg": (bytes) => startsWithBytes(bytes, [0xff, 0xd8, 0xff]),
  "image/png": (bytes) => startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": (bytes) => ["GIF87a", "GIF89a"].includes(asciiAt(bytes, 0, 6)),
  "image/webp": (bytes) => asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP",
  "image/heic": (bytes) => hasIsoBmffBrand(bytes, HEIC_BRANDS),
  "image/heif": (bytes) => hasIsoBmffBrand(bytes, HEIC_BRANDS),
  "image/avif": (bytes) => hasIsoBmffBrand(bytes, AVIF_BRANDS),
};

export async function assertUploadContentMatchesType(file: File): Promise<void> {
  const matches = CONTENT_SIGNATURE_CHECKS[file.type];
  if (!matches) throw new Error(CONTENT_MISMATCH_ERROR);
  const head = new Uint8Array(await file.slice(0, SIGNATURE_READ_BYTES).arrayBuffer());
  if (!matches(head)) throw new Error(CONTENT_MISMATCH_ERROR);
}

export function assertValidAvatarUpload(file: File): void {
  if (!AVATAR_UPLOAD_MIME_TYPE_SET.has(file.type)) {
    throw new Error(AVATAR_UPLOAD_TYPE_ERROR);
  }

  if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
    throw new Error(`Photo is too large. Max ${MAX_AVATAR_UPLOAD_BYTES / (1024 * 1024)} MB.`);
  }
}

export function assertValidCoverUpload(file: File): void {
  if (!COVER_UPLOAD_MIME_TYPE_SET.has(file.type)) {
    throw new Error(COVER_UPLOAD_TYPE_ERROR);
  }

  if (file.size > MAX_COVER_IMAGE_UPLOAD_BYTES) {
    throw new Error("Cover image exceeds 12 MB limit.");
  }
}

// Reverse of MIME_TYPE_EXTENSIONS. Both "image/heic" and "image/heif" map to the "heic" extension;
// the first-seen (canonical) MIME type wins so the reverse lookup stays deterministic.
export const EXTENSION_MIME_TYPES: Record<string, string> = Object.entries(MIME_TYPE_EXTENSIONS).reduce(
  (reversed, [mimeType, extension]) => {
    reversed[extension] ??= mimeType;
    return reversed;
  },
  {} as Record<string, string>
);

export function getMimeTypeForExtension(extension: string): string {
  const mimeType = EXTENSION_MIME_TYPES[extension];

  if (!mimeType) {
    throw new Error(`Unsupported storage file extension: ${extension}`);
  }

  return mimeType;
}

export function getUploadExtension(mimeType: string): string {
  const extension = MIME_TYPE_EXTENSIONS[mimeType];

  if (!extension) {
    throw new Error(`Unsupported upload MIME type: ${mimeType}`);
  }

  return extension;
}

export function createUploadStorageName(scope: UploadScope, ownerId: string, mimeType: string): string {
  const extension = getUploadExtension(mimeType);
  return `${UPLOAD_SCOPE_PREFIXES[scope]}/${ownerId}/${crypto.randomUUID()}.${extension}`;
}
