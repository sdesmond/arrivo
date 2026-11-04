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
