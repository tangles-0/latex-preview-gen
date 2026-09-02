import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupThumbnailScratchFiles } from "@/lib/jobs/cleanup";

const originalDownloadPath = process.env.DOWNLOAD_PATH;
const originalLibraryPath = process.env.NODE_LIBRARY_PATH;
const originalThumbnailPath = process.env.THUMBNAIL_PATH;
const temporaryDirectories: string[] = [];

const restoreEnvironmentVariable = (
  name: "DOWNLOAD_PATH" | "NODE_LIBRARY_PATH" | "THUMBNAIL_PATH",
  value: string | undefined,
) => {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
};

afterEach(async () => {
  restoreEnvironmentVariable("DOWNLOAD_PATH", originalDownloadPath);
  restoreEnvironmentVariable("NODE_LIBRARY_PATH", originalLibraryPath);
  restoreEnvironmentVariable("THUMBNAIL_PATH", originalThumbnailPath);
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("cleanupThumbnailScratchFiles", () => {
  it("removes downloaded and generated scratch files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "preview-cleanup-test-"));
    temporaryDirectories.push(root);
    const downloadRoot = path.join(root, "downloads");
    const thumbnailRoot = path.join(root, "thumbnails");
    const downloadedPath = path.join(downloadRoot, "source.pdf");
    const thumbnailPath = path.join(thumbnailRoot, "preview.jpg");
    await mkdir(downloadRoot);
    await mkdir(thumbnailRoot);
    await writeFile(downloadedPath, "source");
    await writeFile(thumbnailPath, "preview");
    process.env.DOWNLOAD_PATH = downloadRoot;
    process.env.THUMBNAIL_PATH = thumbnailRoot;
    delete process.env.NODE_LIBRARY_PATH;

    await cleanupThumbnailScratchFiles({ downloadedPath, thumbnailPath });

    await expect(access(downloadedPath)).rejects.toThrow();
    await expect(access(thumbnailPath)).rejects.toThrow();
  });

  it("never removes a configured library file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "preview-cleanup-test-"));
    temporaryDirectories.push(root);
    const libraryRoot = path.join(root, "library");
    const sourcePath = path.join(libraryRoot, "source.pdf");
    await mkdir(libraryRoot);
    await writeFile(sourcePath, "source");
    process.env.DOWNLOAD_PATH = root;
    process.env.NODE_LIBRARY_PATH = libraryRoot;

    await cleanupThumbnailScratchFiles({ downloadedPath: sourcePath });

    await expect(access(sourcePath)).resolves.toBeUndefined();
  });
});
