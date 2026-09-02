import { describe, expect, it } from "vitest";

import { thumbnailJobPayloadSchema } from "@/lib/jobs/types";

const basePayload = {
  mediaId: "media-1",
  contentType: "document",
  mimeType: "application/pdf",
  fileSizeBytes: 10,
};

describe("thumbnailJobPayloadSchema", () => {
  it("accepts an HTTP source", () => {
    expect(
      thumbnailJobPayloadSchema.safeParse({
        ...basePayload,
        downloadUrl: "https://latex.example.test/media-1",
      }).success,
    ).toBe(true);
  });

  it("accepts a local source", () => {
    expect(
      thumbnailJobPayloadSchema.safeParse({
        ...basePayload,
        localSourcePath: "documents/media-1.pdf",
      }).success,
    ).toBe(true);
  });

  it("rejects missing or ambiguous sources", () => {
    expect(thumbnailJobPayloadSchema.safeParse(basePayload).success).toBe(
      false,
    );
    expect(
      thumbnailJobPayloadSchema.safeParse({
        ...basePayload,
        downloadUrl: "https://latex.example.test/media-1",
        localSourcePath: "documents/media-1.pdf",
      }).success,
    ).toBe(false);
  });
});
