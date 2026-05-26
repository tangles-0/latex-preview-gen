import { z } from "zod";

export const youtubeMetadataRequestSchema = z.object({
  url: z.string().url(),
});

export const youtubeDownloadRequestSchema = z.object({
  ingestId: z.string().min(1),
  userId: z.string().min(1),
  youtubeId: z.string().min(1),
  qualityId: z.string().min(1),
});

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
