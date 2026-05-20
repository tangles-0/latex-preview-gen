import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { getThumbnailPath } from "@/lib/env";
import { safeMediaFileName } from "@/lib/preview/paths";
import type { ThumbnailGenerator } from "@/lib/preview/types";

const supportedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "text/markdown",
  "text/plain",
] as const;

export const dummyThumbnailGenerator: ThumbnailGenerator = {
  id: "dummy",
  supportedContentTypes: ["image", "video", "document", "text"],
  supportedMimeTypes,
  generate: async ({ mediaId, sourcePath }) => {
    const startedAt = performance.now();
    const thumbnailDirectory = getThumbnailPath();
    const dummyThumbnailPath = path.join(
      process.cwd(),
      "data",
      "thumbnails",
      "dummy.jpg",
    );
    const thumbnailPath = path.join(
      thumbnailDirectory,
      safeMediaFileName(mediaId, ".jpg"),
    );

    console.info(
      `Generating dummy thumbnail for ${mediaId} from ${sourcePath}`,
    );

    await mkdir(thumbnailDirectory, { recursive: true });
    await copyFile(dummyThumbnailPath, thumbnailPath);

    return {
      thumbnailPath,
      generationDurationMs: Math.round(performance.now() - startedAt),
    };
  },
};
