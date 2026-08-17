import { formatFileSize, MAX_COVER_IMAGE_UPLOAD_BYTES, MAX_UPLOAD_BYTES } from "@/lib/utils";

export const DOCUMENT_UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic";
export const DOCUMENT_UPLOAD_CHOOSER_LABEL = "Choose file (PDF, JPG, PNG, WEBP, HEIC)";
export const DOCUMENT_UPLOAD_HINT = "PDF, JPG, PNG, WEBP, HEIC · max 25 MB";

export const COVER_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/avif";
export const COVER_UPLOAD_HINT = "JPG, PNG, WEBP, HEIC, GIF, AVIF · max 12 MB";

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
const COVER_UPLOAD_TYPE_ERROR = "Unsupported cover image type. Choose JPG, PNG, WEBP, HEIC, GIF, or AVIF.";

export type UploadScope = "trip-document" | "event-document" | "reservation-document" | "trip-cover";

const UPLOAD_SCOPE_PREFIXES: Record<UploadScope, string> = {
  "event-document": "event-documents",
  "reservation-document": "reservation-documents",
  "trip-cover": "trip-covers",
  "trip-document": "trip-documents",
};

export function assertValidDocumentUpload(file: File): void {
  if (!DOCUMENT_UPLOAD_MIME_TYPE_SET.has(file.type)) {
    throw new Error(DOCUMENT_UPLOAD_TYPE_ERROR);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large. Max ${formatFileSize(MAX_UPLOAD_BYTES)}.`);
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
