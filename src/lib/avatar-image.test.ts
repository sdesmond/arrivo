// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AVATAR_IMAGE_SIZE, AvatarImageError, MAX_AVATAR_INPUT_PIXELS, processAvatarImage } from "./avatar-image";

async function solid(width: number, height: number, format: "png" | "jpeg" | "webp" | "gif" = "png") {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    [format]()
    .toBuffer();
}

async function readPixel(image: Buffer, column: number, row: number) {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const offset = (row * info.width + column) * info.channels;
  return { red: data[offset], green: data[offset + 1], blue: data[offset + 2] };
}

describe("processAvatarImage", () => {
  it.each(["png", "jpeg", "webp"] as const)("re-encodes %s input to a 256x256 WebP", async (format) => {
    const output = await processAvatarImage(await solid(600, 400, format));
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(AVATAR_IMAGE_SIZE);
    expect(metadata.height).toBe(AVATAR_IMAGE_SIZE);
    expect(AVATAR_IMAGE_SIZE).toBe(256);
  });

  it("center-crops a wide image instead of squashing it", async () => {
    const wide = await sharp({ create: { width: 400, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } } })
      .composite([
        {
          input: { create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } },
          left: 0,
          top: 0,
        },
        {
          input: { create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } },
          left: 300,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    const output = await processAvatarImage(wide);

    // Edges (red) are cropped away; the green middle fills the square.
    const corner = await readPixel(output, 4, 128);
    expect(corner.green).toBeGreaterThan(200);
    expect(corner.red).toBeLessThan(60);
  });

  it("applies EXIF orientation before cropping", async () => {
    // Left half red, right half blue, tagged "rotate 90° clockwise": upright, red is on top.
    const tagged = await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .composite([
        {
          input: { create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } },
          left: 0,
          top: 0,
        },
      ])
      .jpeg({ quality: 100 })
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const output = await processAvatarImage(tagged);

    const top = await readPixel(output, 128, 10);
    const bottom = await readPixel(output, 128, 246);
    expect(top.red).toBeGreaterThan(top.blue);
    expect(bottom.blue).toBeGreaterThan(bottom.red);
  });

  it("strips EXIF and other metadata from the output", async () => {
    const tagged = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "private" } } })
      .toBuffer();

    const output = await processAvatarImage(tagged);
    const metadata = await sharp(output).metadata();

    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(output.includes(Buffer.from("private"))).toBe(false);
  });

  it("upscales a tiny image to 256x256", async () => {
    const metadata = await sharp(await processAvatarImage(await solid(20, 20))).metadata();
    expect([metadata.width, metadata.height]).toEqual([256, 256]);
  });

  it("rejects an image over the input pixel cap before decoding it", async () => {
    const side = Math.ceil(Math.sqrt(MAX_AVATAR_INPUT_PIXELS)) + 1;

    await expect(processAvatarImage(await solid(side, side))).rejects.toThrow(AvatarImageError);
  });

  it("rejects corrupt bytes with a readable message", async () => {
    await expect(processAvatarImage(Buffer.from("definitely not an image"))).rejects.toThrow(
      "Couldn't read that image"
    );
  });

  it("rejects an empty buffer", async () => {
    await expect(processAvatarImage(Buffer.alloc(0))).rejects.toBeInstanceOf(AvatarImageError);
  });

  it("rejects real images whose actual format is not JPEG, PNG, or WebP", async () => {
    await expect(processAvatarImage(await solid(32, 32, "gif"))).rejects.toThrow("Couldn't read that image");
  });
});
