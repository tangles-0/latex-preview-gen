import { describe, expect, it } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { textThumbnailGenerator } from "@/lib/preview/textThumbnailGenerator";

describe("textThumbnailGenerator", () => {
  it("renders a jpeg thumbnail from a js source file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "text-preview-"));
    const sourcePath = path.join(directory, "sample.js");
    try {
      await writeFile(
        sourcePath,
        "function hello() {\n  return 'world';\n}\n",
        "utf8",
      );

      const result = await textThumbnailGenerator.generate({
        mediaId: "test-js-preview",
        sourcePath,
        contentType: "text",
        mimeType: "application/javascript",
        metadata: { ext: "js" },
      });

      expect(result.thumbnailPath).toContain("test-js-preview");
      expect(result.generationDurationMs).toBeGreaterThanOrEqual(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
