import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempCandidates = [
  process.env.LATEX_PREVIEW_TMP_DIR,
  path.join(process.cwd(), "data", "tmp"),
  "/var/tmp",
  os.tmpdir(),
  "/dev/shm",
].filter((value): value is string => Boolean(value?.trim()));

export const createWorkingDir = async (prefix: string) => {
  let lastError: Error | null = null;

  for (const candidate of tempCandidates) {
    try {
      await mkdir(candidate, { recursive: true });
      return await mkdtemp(path.join(candidate, prefix));
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Unable to create temporary working directory.");
    }
  }

  throw lastError ?? new Error("Unable to create temporary working directory.");
};

export const removeWorkingDir = async (directory: string) => {
  await rm(directory, { recursive: true, force: true });
};
