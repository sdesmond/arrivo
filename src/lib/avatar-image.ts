import sharp from "sharp";

export const AVATAR_IMAGE_SIZE = 256;
// Rejects decompression bombs: a small file can declare billions of pixels.
export const MAX_AVATAR_INPUT_PIXELS = 25_000_000;
const AVATAR_WEBP_QUALITY = 85;
const ACCEPTED_INPUT_FORMATS = new Set(["jpeg", "png", "webp"]);

export class AvatarImageError extends Error {
  constructor() {
    super("Couldn't read that image");
    this.name = "AvatarImageError";
  }
}

/**
 * Decodes an uploaded photo, applies its EXIF orientation, center-crops to a square, and re-encodes it as a
 * 256x256 WebP. Metadata (EXIF, GPS, ICC) is dropped. The decoded format is checked against the allowed set so the
 * client-reported MIME type is never trusted on its own.
 */
export async function processAvatarImage(input: Buffer): Promise<Buffer> {
  try {
    const image = sharp(input, { limitInputPixels: MAX_AVATAR_INPUT_PIXELS, failOn: "error" });
    const { format } = await image.metadata();
    if (!format || !ACCEPTED_INPUT_FORMATS.has(format)) throw new AvatarImageError();

    return await image
      .rotate()
      .resize(AVATAR_IMAGE_SIZE, AVATAR_IMAGE_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: AVATAR_WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new AvatarImageError();
  }
}
