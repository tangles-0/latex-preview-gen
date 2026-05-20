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
