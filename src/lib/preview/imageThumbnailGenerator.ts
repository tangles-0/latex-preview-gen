import { writeJpegThumbnail } from "@/lib/preview/output";
import type { ThumbnailGenerator } from "@/lib/preview/types";

export const imageThumbnailGenerator: ThumbnailGenerator = {
  id: "image-sharp",
  supportedContentTypes: ["image"],
  supportedMimeTypes: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "image/svg+xml",
  ],
  generate: async ({ mediaId, sourcePath }) => {
    const startedAt = performance.now();
    const thumbnailPath = await writeJpegThumbnail({
      mediaId,
      input: sourcePath,
    });

    return {
      thumbnailPath,
      generationDurationMs: Math.round(performance.now() - startedAt),
    };
  },
};
