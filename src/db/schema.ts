import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const thumbnailGenerationJobs = pgTable(
  "thumbnail_generation_jobs",
  {
    mediaId: text("media_id").primaryKey(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    failureReason: text("failure_reason"),
    lastError: text("last_error"),
    sourceUrl: text("source_url").notNull(),
    contentType: text("content_type").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    youtubeId: text("youtube_id"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    downloadedPath: text("downloaded_path"),
    thumbnailPath: text("thumbnail_path"),
    generationDurationMs: integer("generation_duration_ms"),
    sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    createdThumbnailAt: timestamp("created_thumbnail_at", {
      withTimezone: true,
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index("thumbnail_generation_jobs_status_idx").on(table.status),
    createdAtIdx: index("thumbnail_generation_jobs_created_at_idx").on(
      table.createdAt,
    ),
  }),
);

export type ThumbnailGenerationJob =
  typeof thumbnailGenerationJobs.$inferSelect;
export type NewThumbnailGenerationJob =
  typeof thumbnailGenerationJobs.$inferInsert;

export const youtubeVideos = pgTable(
  "youtube_videos",
  {
    youtubeId: text("youtube_id").primaryKey(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    channelName: text("channel_name").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    qualities: jsonb("qualities")
      .$type<
        Array<{
          id: string;
          label: string;
          height: number | null;
          fps: number | null;
          ext: string;
          filesizeBytes: number | null;
        }>
      >()
      .notNull(),
    thumbnailUrl: text("thumbnail_url"),
    thumbnailPath: text("thumbnail_path"),
    rawMetadata: jsonb("raw_metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    titleIdx: index("youtube_videos_title_idx").on(table.title),
  }),
);

export const youtubeIngestJobs = pgTable(
  "youtube_ingest_jobs",
  {
    ingestId: text("ingest_id").primaryKey(),
    userId: text("user_id").notNull(),
    youtubeId: text("youtube_id")
      .notNull()
      .references(() => youtubeVideos.youtubeId),
    qualityId: text("quality_id").notNull(),
    status: text("status").notNull().default("pending"),
    progress: integer("progress").notNull().default(0),
    error: text("error"),
    downloadedPath: text("downloaded_path"),
    uploadedMediaId: text("uploaded_media_id"),
    fileName: text("file_name"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    youtubeIdIdx: index("youtube_ingest_jobs_youtube_id_idx").on(
      table.youtubeId,
    ),
    statusIdx: index("youtube_ingest_jobs_status_idx").on(table.status),
  }),
);

export type YoutubeVideo = typeof youtubeVideos.$inferSelect;
export type NewYoutubeVideo = typeof youtubeVideos.$inferInsert;
export type YoutubeIngestJob = typeof youtubeIngestJobs.$inferSelect;
export type NewYoutubeIngestJob = typeof youtubeIngestJobs.$inferInsert;
