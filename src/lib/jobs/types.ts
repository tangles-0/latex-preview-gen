import { z } from "zod";

export const thumbnailJobPayloadSchema = z
  .object({
    mediaId: z.string().min(1),
    downloadUrl: z.string().url().optional(),
    localSourcePath: z.string().trim().min(1).max(4096).optional(),
    contentType: z.string().min(1),
    mimeType: z.string().min(1),
    fileSizeBytes: z.number().int().nonnegative(),
    youtubeId: z.string().min(1).optional(),
    ext: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .superRefine((payload, context) => {
    const sourceCount =
      Number(Boolean(payload.downloadUrl)) +
      Number(Boolean(payload.localSourcePath));

    if (sourceCount !== 1) {
      context.addIssue({
        code: "custom",
        message: "Exactly one of downloadUrl or localSourcePath is required",
        path: ["downloadUrl"],
      });
    }
  });

export type ThumbnailJobPayload = z.infer<typeof thumbnailJobPayloadSchema>;

export const terminalStatuses = [
  "complete",
  "failed: file not found in latex",
  "failed: already complete",
] as const;

export type SortField =
  | "createdAt"
  | "updatedAt"
  | "status"
  | "attempts"
  | "mediaId";

export type SortDirection = "asc" | "desc";
