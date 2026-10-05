import sharp from "sharp";
import { fail } from "./errors";
export const imageLimit =
  Number(process.env.ITEM_IMAGE_MAX_BYTES) || 12 * 1024 * 1024;
export async function inspectImage(bytes: Buffer) {
  if (bytes.length > imageLimit)
    fail("ITEM_ASSET_TOO_LARGE", "Image is too large", 413);
  try {
    const resolution = Number(process.env.ITEM_IMAGE_MAX_RESOLUTION) || 4096;
    const image = sharp(bytes, {
      limitInputPixels: resolution * resolution,
      failOn: "warning",
      animated: false,
    });
    const info = await image.metadata();
    if (
      !["png", "jpeg", "webp"].includes(info.format ?? "") ||
      !info.width ||
      !info.height ||
      info.width > resolution ||
      info.height > resolution ||
      (info.pages ?? 1) > 1
    )
      fail(
        "ITEM_TEXTURE_INVALID",
        "Use a single PNG, JPEG or WebP image up to 4096 × 4096",
      );
    await image.raw().toBuffer();
    return {
      mimeType: `image/${info.format}`,
      width: info.width,
      height: info.height,
    };
  } catch {
    fail("ITEM_TEXTURE_INVALID", "Image cannot be safely decoded");
  }
}
