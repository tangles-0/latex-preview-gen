import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LocalSourcePathError,
  resolveLocalSourcePath,
} from "@/lib/jobs/localPaths";

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "preview-path-test-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("resolveLocalSourcePath", () => {
  it("accepts a regular file beneath the configured root", async () => {
    const root = await createTemporaryDirectory();
    const nestedDirectory = path.join(root, "nested");
    const sourcePath = path.join(nestedDirectory, "source.pdf");
    await mkdir(nestedDirectory);
    await writeFile(sourcePath, "pdf");

    await expect(
      resolveLocalSourcePath("nested/source.pdf", root),
    ).resolves.toBe(sourcePath);
  });

  it("rejects traversal outside the configured root", async () => {
    const parent = await createTemporaryDirectory();
    const root = path.join(parent, "library");
    await mkdir(root);
    await writeFile(path.join(parent, "outside.pdf"), "pdf");

    await expect(
      resolveLocalSourcePath("../outside.pdf", root),
    ).rejects.toThrow("must remain inside NODE_LIBRARY_PATH");
  });

  it("rejects symlinks even when their target is inside the root", async () => {
    const root = await createTemporaryDirectory();
    const targetPath = path.join(root, "target.pdf");
    await writeFile(targetPath, "pdf");
    await symlink(targetPath, path.join(root, "source.pdf"));

    await expect(resolveLocalSourcePath("source.pdf", root)).rejects.toThrow(
      "may not contain symlinks",
    );
  });

  it("requires an explicitly configured root", async () => {
    await expect(
      resolveLocalSourcePath("/tmp/source.pdf", null),
    ).rejects.toBeInstanceOf(LocalSourcePathError);
  });
});
