import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { getThumbnailPath } from "@/lib/env";
import { safeMediaFileName } from "@/lib/preview/paths";

export const writeJpegThumbnail = async ({
  mediaId,
  input,
}: {
  mediaId: string;
  input: string | Buffer;
}) => {
  const thumbnailDirectory = getThumbnailPath();
  const thumbnailPath = path.join(
    thumbnailDirectory,
    safeMediaFileName(mediaId, ".jpg"),
  );

  await mkdir(thumbnailDirectory, { recursive: true });
  try {
    await sharp(input, { animated: false })
      .rotate()
      .resize({ width: 1024, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(thumbnailPath);
  } catch (error) {
    await rm(thumbnailPath, { force: true }).catch(() => {});
    throw error;
  }

  return thumbnailPath;
};
