import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export interface SaveLocalUploadOptions {
  rootDir?: string;
  storageName?: string;
}

function createFallbackStorageName(file: File): string {
  const safeName = basename(file.name).replace(/[^\w.-]/g, "_");
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${randomSuffix}-${safeName}`;
}

function normalizeStorageName(storageName: string): string {
  const normalized = storageName.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/");

  if (
    normalized.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid upload storage name");
  }

  return normalized;
}

export async function saveLocalUpload(file: File, options: SaveLocalUploadOptions = {}): Promise<string> {
  const rootDir = options.rootDir ?? process.cwd();
  const storageName = normalizeStorageName(options.storageName ?? createFallbackStorageName(file));
  const uploadsDir = join(/* turbopackIgnore: true */ rootDir, "public", "uploads");
  const targetPath = join(/* turbopackIgnore: true */ uploadsDir, /* turbopackIgnore: true */ storageName);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, Buffer.from(await file.arrayBuffer()));
  return `/uploads/${storageName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function isLocalUploadUrl(url: string): boolean {
  return url.startsWith("/uploads/");
}

export function isBlobUploadUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return (
      hostname === "blob.vercel.com" ||
      hostname === "blob.vercel.dev" ||
      hostname.endsWith(".blob.vercel-storage.com") ||
      hostname.endsWith(".public.blob.vercel-storage.com") ||
      hostname.endsWith(".vercel-storage.com")
    );
  } catch {
    return false;
  }
}
