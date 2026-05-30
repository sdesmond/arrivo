import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export async function saveLocalUpload(file: File, rootDir = process.cwd()): Promise<string> {
  const uploadsDir = join(rootDir, "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const safeName = basename(file.name).replace(/[^\w.-]/g, "_");
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const uniqueName = `${Date.now()}-${randomSuffix}-${safeName}`;
  await writeFile(join(uploadsDir, uniqueName), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${encodeURIComponent(uniqueName)}`;
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
