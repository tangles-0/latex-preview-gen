import path from "node:path";

import { uploadFileToLatex } from "@/lib/latex/multipartUpload";
import type { YoutubeOutputType } from "@/lib/youtube/types";

const sanitizeFileName = (title: string, extension: string) => {
  const safeTitle = title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return `${safeTitle || "YouTube video"}${extension}`;
};

export const uploadYoutubeMediaToLatex = async ({
  ingestId,
  userId,
  youtubeId,
  title,
  filePath,
  mimeType,
  outputType,
  onProgress,
}: {
  ingestId: string;
  userId: string;
  youtubeId: string;
  title: string;
  filePath: string;
  mimeType: string;
  outputType: YoutubeOutputType;
  onProgress: (progress: number) => Promise<void>;
}) => {
  const fileName = sanitizeFileName(title, path.extname(filePath) || ".mp4");
  const result = await uploadFileToLatex({
    userId,
    fileName,
    filePath,
    mimeType,
    targetType: outputType === "audio" ? "other" : "video",
    completePayload: {
      youtubeIngestId: ingestId,
      youtubeId,
      title,
      youtubeMediaType: outputType,
    },
    onProgress,
  });

  return {
    fileName,
    fileSize: result.fileSize,
    mediaId: result.mediaId,
  };
};
