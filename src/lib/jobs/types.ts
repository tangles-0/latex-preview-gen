import { z } from "zod";

export const thumbnailJobPayloadSchema = z
  .object({
    mediaId: z.string().min(1),
    downloadUrl: z.string().url(),
    contentType: z.string().min(1),
    mimeType: z.string().min(1),
    fileSizeBytes: z.number().int().nonnegative(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

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
