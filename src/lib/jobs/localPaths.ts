import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { getNodeLibraryPath } from "@/lib/env";

export class LocalSourcePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalSourcePathError";
  }
}

export const isPathWithinRoot = (candidatePath: string, rootPath: string) => {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
};

export const resolveLocalSourcePath = async (
  sourcePath: string,
  configuredRoot = getNodeLibraryPath(),
) => {
  if (!configuredRoot) {
    throw new LocalSourcePathError(
      "Local source paths require NODE_LIBRARY_PATH to be configured.",
    );
  }

  const configuredRootPath = path.resolve(configuredRoot);
  const requestedPath = path.isAbsolute(sourcePath)
    ? path.resolve(sourcePath)
    : path.resolve(configuredRootPath, sourcePath);

  if (!isPathWithinRoot(requestedPath, configuredRootPath)) {
    throw new LocalSourcePathError(
      "Local source path must remain inside NODE_LIBRARY_PATH.",
    );
  }

  let rootPath: string;

  try {
    rootPath = await realpath(configuredRootPath);
  } catch {
    throw new LocalSourcePathError("NODE_LIBRARY_PATH does not exist.");
  }

  const relativePath = path.relative(configuredRootPath, requestedPath);
  let currentPath = configuredRootPath;

  for (const segment of relativePath.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, segment);

    let stats;
    try {
      stats = await lstat(currentPath);
    } catch {
      throw new LocalSourcePathError("Local source path does not exist.");
    }

    if (stats.isSymbolicLink()) {
      throw new LocalSourcePathError(
        "Local source path may not contain symlinks.",
      );
    }
  }

  let resolvedPath: string;
  try {
    resolvedPath = await realpath(requestedPath);
  } catch {
    throw new LocalSourcePathError("Local source path does not exist.");
  }

  if (!isPathWithinRoot(resolvedPath, rootPath)) {
    throw new LocalSourcePathError(
      "Local source path must remain inside NODE_LIBRARY_PATH.",
    );
  }

  const stats = await lstat(resolvedPath);
  if (!stats.isFile()) {
    throw new LocalSourcePathError("Local source path must reference a file.");
  }

  return requestedPath;
};
