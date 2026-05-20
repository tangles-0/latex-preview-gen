import { readFile } from "node:fs/promises";
import path from "node:path";

import { writeJpegThumbnail } from "@/lib/preview/output";
import { runProcess } from "@/lib/preview/process";
import { createWorkingDir, removeWorkingDir } from "@/lib/preview/temp";
import type { ThumbnailGenerator } from "@/lib/preview/types";

const extractVideoFrame = async (sourcePath: string) => {
  const tempDirectory = await createWorkingDir("latex-video-preview-");
  const outputPath = path.join(tempDirectory, "preview.png");

  try {
    await runProcess(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-ss",
        "00:00:01",
        "-i",
        sourcePath,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(1024,iw)':-2:flags=lanczos",
        "-an",
        "-sn",
        "-dn",
        "-y",
        outputPath,
      ],
      { timeoutMs: 30_000 },
    );

    return await readFile(outputPath);
  } finally {
    await removeWorkingDir(tempDirectory);
  }
};

export const videoThumbnailGenerator: ThumbnailGenerator = {
  id: "video-ffmpeg",
  supportedContentTypes: ["video"],
  supportedMimeTypes: [
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
    "video/x-msvideo",
    "video/mpeg",
    "video/x-ms-wmv",
    "video/x-flv",
  ],
  generate: async ({ mediaId, sourcePath }) => {
    const startedAt = performance.now();
    const frame = await extractVideoFrame(sourcePath);
    const thumbnailPath = await writeJpegThumbnail({
      mediaId,
      input: frame,
    });

    return {
      thumbnailPath,
      generationDurationMs: Math.round(performance.now() - startedAt),
    };
  },
};
