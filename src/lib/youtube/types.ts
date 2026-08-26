import { z } from "zod";

export const youtubeMetadataRequestSchema = z.object({
  url: z.string().url(),
});

export const youtubeDownloadRequestSchema = z
  .object({
    ingestId: z.string().min(1),
    userId: z.string().min(1),
    youtubeId: z.string().min(1),
    outputType: z.enum(["video", "audio"]).default("video"),
    qualityId: z.string().min(1).optional(),
  })
  .refine(
    (payload) => payload.outputType === "audio" || Boolean(payload.qualityId),
    {
      message: "qualityId is required for video downloads.",
      path: ["qualityId"],
    },
  );

export type YoutubeOutputType = "video" | "audio";

export type YoutubeQuality = {
  id: string;
  label: string;
  height: number | null;
  fps: number | null;
  ext: string;
  filesizeBytes: number | null;
};

export type YoutubeMetadata = {
  youtubeId: string;
  title: string;
  channelName: string;
  durationSeconds: number;
  qualities: YoutubeQuality[];
  thumbnailUrl?: string;
  thumbnailPath?: string;
  rawMetadata: Record<string, unknown>;
};

export type YoutubeIngestStatus =
  | "downloading"
  | "uploading"
  | "complete"
  | "error";
