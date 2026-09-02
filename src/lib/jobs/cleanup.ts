import { rm } from "node:fs/promises";
import path from "node:path";

import {
  getDownloadPath,
  getNodeLibraryPath,
  getThumbnailPath,
} from "@/lib/env";
import { isPathWithinRoot } from "@/lib/jobs/localPaths";

const removeWithinRoot = async (
  filePath: string | null | undefined,
  configuredRoot: string,
) => {
  if (!filePath) {
    return;
  }

  const resolvedRoot = path.resolve(configuredRoot);
  const resolvedFilePath = path.resolve(filePath);
  const libraryRoot = getNodeLibraryPath();

  if (
    !isPathWithinRoot(resolvedFilePath, resolvedRoot) ||
    resolvedFilePath === resolvedRoot ||
    (libraryRoot &&
      isPathWithinRoot(resolvedFilePath, path.resolve(libraryRoot)))
  ) {
    return;
  }

  await rm(resolvedFilePath, { force: true }).catch(() => {});
};

export const cleanupThumbnailScratchFiles = async ({
  downloadedPath,
  thumbnailPath,
}: {
  downloadedPath?: string | null;
  thumbnailPath?: string | null;
}) => {
  await Promise.all([
    removeWithinRoot(downloadedPath, getDownloadPath()),
    removeWithinRoot(thumbnailPath, getThumbnailPath()),
  ]);
};
