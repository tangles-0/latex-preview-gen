import { eq } from "drizzle-orm";

import {
  type NewYoutubeIngestJob,
  type NewYoutubeVideo,
  youtubeIngestJobs,
  youtubeVideos,
} from "@/db/schema";
import { db } from "@/db";
import type {
  YoutubeIngestStatus,
  YoutubeMetadata,
  YoutubeOutputType,
} from "@/lib/youtube/types";

const metadataString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

export const upsertYoutubeVideo = async (metadata: YoutubeMetadata) => {
  const sourceUrl =
    metadataString(metadata.rawMetadata.webpage_url) ??
    metadataString(metadata.rawMetadata.original_url) ??
    "";
  const values: NewYoutubeVideo = {
    youtubeId: metadata.youtubeId,
    sourceUrl,
    title: metadata.title,
    channelName: metadata.channelName,
    durationSeconds: metadata.durationSeconds,
    qualities: metadata.qualities,
    thumbnailUrl: metadata.thumbnailUrl ?? null,
    thumbnailPath: metadata.thumbnailPath ?? null,
    rawMetadata: metadata.rawMetadata,
  };

  const [video] = await db
    .insert(youtubeVideos)
    .values(values)
    .onConflictDoUpdate({
      target: youtubeVideos.youtubeId,
      set: {
        ...values,
        updatedAt: new Date(),
      },
    })
    .returning();

  return video;
};

export const getYoutubeVideo = async (youtubeId: string) => {
  const [video] = await db
    .select()
    .from(youtubeVideos)
    .where(eq(youtubeVideos.youtubeId, youtubeId))
    .limit(1);
  return video;
};

export const createOrResetYoutubeIngest = async (input: {
  ingestId: string;
  userId: string;
  youtubeId: string;
  qualityId?: string;
  outputType: YoutubeOutputType;
}) => {
  const values: NewYoutubeIngestJob = {
    ingestId: input.ingestId,
    userId: input.userId,
    youtubeId: input.youtubeId,
    qualityId: input.qualityId ?? "bestaudio",
    outputType: input.outputType,
    status: "pending",
    progress: 0,
    error: null,
  };

  const [job] = await db
    .insert(youtubeIngestJobs)
    .values(values)
    .onConflictDoUpdate({
      target: youtubeIngestJobs.ingestId,
      set: {
        ...values,
        downloadedPath: null,
        uploadedMediaId: null,
        fileName: null,
        fileSizeBytes: null,
        mimeType: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return job;
};

export const updateYoutubeIngestStatus = async (
  ingestId: string,
  status: YoutubeIngestStatus | "pending",
  fields: Partial<NewYoutubeIngestJob> = {},
) => {
  const [job] = await db
    .update(youtubeIngestJobs)
    .set({ ...fields, status, updatedAt: new Date() })
    .where(eq(youtubeIngestJobs.ingestId, ingestId))
    .returning();

  return job;
};
