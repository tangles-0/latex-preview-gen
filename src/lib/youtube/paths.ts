import { mkdir } from "node:fs/promises";
import path from "node:path";

import { getYoutubeDownloadPath, getYoutubeThumbnailPath } from "@/lib/env";
import { safeMediaFileName } from "@/lib/preview/paths";

export const getYoutubeDownloadOutputTemplate = async (ingestId: string) => {
  const directory = getYoutubeDownloadPath();
  await mkdir(directory, { recursive: true });
  return path.join(directory, `${safeMediaFileName(ingestId)}.%(ext)s`);
};

export const getYoutubeThumbnailFilePath = async (
  youtubeId: string,
  extension = ".jpg",
) => {
  const directory = getYoutubeThumbnailPath();
  await mkdir(directory, { recursive: true });
  return path.join(directory, safeMediaFileName(youtubeId, extension));
};
