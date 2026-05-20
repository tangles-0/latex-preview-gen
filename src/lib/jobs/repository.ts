import { and, asc, desc, eq, gte, ilike, lt, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  thumbnailGenerationJobs,
  type NewThumbnailGenerationJob,
} from "@/db/schema";
import type {
  SortDirection,
  SortField,
  ThumbnailJobPayload,
} from "@/lib/jobs/types";

const maxAttempts = 3;

export const createOrResetPendingJob = async (payload: ThumbnailJobPayload) => {
  const [existing] = await db
    .select()
    .from(thumbnailGenerationJobs)
    .where(eq(thumbnailGenerationJobs.mediaId, payload.mediaId))
    .limit(1);

  if (existing && !existing.status.startsWith("failed")) {
    return { job: existing, shouldProcess: false };
  }

  const values: NewThumbnailGenerationJob = {
    mediaId: payload.mediaId,
    status: "pending",
    attempts: 0,
    failureReason: null,
    lastError: null,
    sourceUrl: payload.downloadUrl,
    contentType: payload.contentType,
    mimeType: payload.mimeType,
    fileSizeBytes: payload.fileSizeBytes,
    sourceMetadata: payload.metadata ?? payload,
  };

  const [job] = existing
    ? await db
        .update(thumbnailGenerationJobs)
        .set({
          ...values,
          downloadedPath: null,
          thumbnailPath: null,
          generationDurationMs: null,
          downloadedAt: null,
          startedAt: null,
          createdThumbnailAt: null,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(thumbnailGenerationJobs.mediaId, payload.mediaId))
        .returning()
    : await db.insert(thumbnailGenerationJobs).values(values).returning();

  return { job, shouldProcess: true };
};

export const getJob = async (mediaId: string) => {
  const [job] = await db
    .select()
    .from(thumbnailGenerationJobs)
    .where(eq(thumbnailGenerationJobs.mediaId, mediaId))
    .limit(1);
  return job;
};

export const updateJobStatus = async (
  mediaId: string,
  status: string,
  fields: Partial<NewThumbnailGenerationJob> = {},
) => {
  const [job] = await db
    .update(thumbnailGenerationJobs)
    .set({ ...fields, status, updatedAt: new Date() })
    .where(eq(thumbnailGenerationJobs.mediaId, mediaId))
    .returning();

  return job;
};

export const markJobFailed = async (mediaId: string, reason: string) => {
  const status = `failed: ${reason}`;

  return updateJobStatus(mediaId, status, {
    failureReason: reason,
    lastError: reason,
    completedAt: new Date(),
  });
};

export const incrementAttempts = async (
  mediaId: string,
  lastError?: string,
) => {
  const [job] = await db
    .update(thumbnailGenerationJobs)
    .set({
      attempts: sql`${thumbnailGenerationJobs.attempts} + 1`,
      lastError: lastError ?? null,
      updatedAt: new Date(),
    })
    .where(eq(thumbnailGenerationJobs.mediaId, mediaId))
    .returning();

  return job;
};

export const shouldStopRetrying = (attempts: number) => attempts >= maxAttempts;

export const getRetryableStartupJobs = async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return db
    .update(thumbnailGenerationJobs)
    .set({
      attempts: sql`${thumbnailGenerationJobs.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        gte(thumbnailGenerationJobs.createdAt, cutoff),
        lt(thumbnailGenerationJobs.attempts, maxAttempts),
        ne(thumbnailGenerationJobs.status, "complete"),
        sql`${thumbnailGenerationJobs.status} not like 'failed:%'`,
      ),
    )
    .returning();
};

export const listJobs = async ({
  status,
  sortField,
  sortDirection,
}: {
  status?: string;
  sortField: SortField;
  sortDirection: SortDirection;
}) => {
  const sortColumn = {
    createdAt: thumbnailGenerationJobs.createdAt,
    updatedAt: thumbnailGenerationJobs.updatedAt,
    status: thumbnailGenerationJobs.status,
    attempts: thumbnailGenerationJobs.attempts,
    mediaId: thumbnailGenerationJobs.mediaId,
  }[sortField];

  const whereClause = status
    ? status === "failed"
      ? ilike(thumbnailGenerationJobs.status, "failed:%")
      : eq(thumbnailGenerationJobs.status, status)
    : undefined;

  return db
    .select()
    .from(thumbnailGenerationJobs)
    .where(whereClause)
    .orderBy(sortDirection === "asc" ? asc(sortColumn) : desc(sortColumn))
    .limit(200);
};

export const getStatusCounts = async () => {
  const rows = await db
    .select({
      status: thumbnailGenerationJobs.status,
      count: sql<number>`count(*)::int`,
    })
    .from(thumbnailGenerationJobs)
    .groupBy(thumbnailGenerationJobs.status)
    .orderBy(asc(thumbnailGenerationJobs.status));

  const failedCount = rows
    .filter((row) => row.status.startsWith("failed"))
    .reduce((total, row) => total + Number(row.count), 0);

  return {
    rows,
    failedCount,
  };
};

export const markLatexTerminalFailure = async (
  mediaId: string,
  statusCode: number,
) => {
  if (statusCode === 404) {
    return markJobFailed(mediaId, "file not found in latex");
  }

  if (statusCode === 409) {
    return markJobFailed(mediaId, "already complete");
  }

  return null;
};
