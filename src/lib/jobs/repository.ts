import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

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

export const maximumThumbnailAttempts = 3;
const claimLeaseMs = 60_000;
const claimCoordinatorLockKey = 1_945_582_074;

const isNonTerminalStatus = () =>
  and(
    ne(thumbnailGenerationJobs.status, "complete"),
    sql`${thumbnailGenerationJobs.status} not like 'failed:%'`,
  );

export const createOrResetPendingJob = async (payload: ThumbnailJobPayload) => {
  const now = new Date();
  const values: NewThumbnailGenerationJob = {
    mediaId: payload.mediaId,
    status: "pending",
    attempts: 0,
    failureReason: null,
    lastError: null,
    sourceUrl: payload.downloadUrl ?? null,
    localSourcePath: payload.localSourcePath ?? null,
    contentType: payload.contentType,
    mimeType: payload.mimeType,
    youtubeId: payload.youtubeId ?? null,
    fileSizeBytes: payload.fileSizeBytes,
    sourceMetadata: payload.metadata ?? payload,
    nextAttemptAt: now,
    claimToken: null,
    leaseExpiresAt: null,
  };

  const [created] = await db
    .insert(thumbnailGenerationJobs)
    .values(values)
    .onConflictDoNothing()
    .returning();

  if (created) {
    return { job: created, shouldProcess: true };
  }

  const [existing] = await db
    .select()
    .from(thumbnailGenerationJobs)
    .where(eq(thumbnailGenerationJobs.mediaId, payload.mediaId))
    .limit(1);

  if (!existing) {
    throw new Error("Unable to create or load thumbnail job.");
  }

  if (!existing.status.startsWith("failed")) {
    return { job: existing, shouldProcess: false };
  }

  const [reset] = await db
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
      updatedAt: now,
    })
    .where(
      and(
        eq(thumbnailGenerationJobs.mediaId, payload.mediaId),
        sql`${thumbnailGenerationJobs.status} like 'failed:%'`,
      ),
    )
    .returning();

  if (reset) {
    return { job: reset, shouldProcess: true };
  }

  const current = await getJob(payload.mediaId);
  if (!current) {
    throw new Error("Unable to load thumbnail job after reset.");
  }

  return { job: current, shouldProcess: false };
};

export const getJob = async (mediaId: string) => {
  const [job] = await db
    .select()
    .from(thumbnailGenerationJobs)
    .where(eq(thumbnailGenerationJobs.mediaId, mediaId))
    .limit(1);
  return job;
};

export const updateClaimedJobStatus = async (
  mediaId: string,
  claimToken: string,
  status: string,
  fields: Partial<NewThumbnailGenerationJob> = {},
) => {
  const [job] = await db
    .update(thumbnailGenerationJobs)
    .set({ ...fields, status, updatedAt: new Date() })
    .where(
      and(
        eq(thumbnailGenerationJobs.mediaId, mediaId),
        eq(thumbnailGenerationJobs.claimToken, claimToken),
      ),
    )
    .returning();

  return job;
};

export const markClaimedJobFailed = async (
  mediaId: string,
  claimToken: string,
  reason: string,
) => {
  const status = `failed: ${reason}`;

  return updateClaimedJobStatus(mediaId, claimToken, status, {
    failureReason: reason,
    lastError: reason,
    completedAt: new Date(),
    downloadedPath: null,
    thumbnailPath: null,
    claimToken: null,
    leaseExpiresAt: null,
  });
};

export const renewThumbnailJobClaim = async (
  mediaId: string,
  claimToken: string,
) => {
  const now = new Date();
  const [job] = await db
    .update(thumbnailGenerationJobs)
    .set({
      leaseExpiresAt: new Date(now.getTime() + claimLeaseMs),
      updatedAt: now,
    })
    .where(
      and(
        eq(thumbnailGenerationJobs.mediaId, mediaId),
        eq(thumbnailGenerationJobs.claimToken, claimToken),
        isNonTerminalStatus(),
      ),
    )
    .returning();

  return job;
};

export const claimNextThumbnailJob = async (concurrency: number) => {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(${claimCoordinatorLockKey})`,
    );

    const now = new Date();
    const [activeClaims] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(thumbnailGenerationJobs)
      .where(
        and(
          isNonTerminalStatus(),
          isNotNull(thumbnailGenerationJobs.claimToken),
          gt(thumbnailGenerationJobs.leaseExpiresAt, now),
        ),
      );

    if (Number(activeClaims?.count ?? 0) >= concurrency) {
      return undefined;
    }

    const claimable = and(
      isNonTerminalStatus(),
      lt(thumbnailGenerationJobs.attempts, maximumThumbnailAttempts),
      or(
        and(
          eq(thumbnailGenerationJobs.status, "pending"),
          lte(thumbnailGenerationJobs.nextAttemptAt, now),
          isNull(thumbnailGenerationJobs.claimToken),
        ),
        and(
          ne(thumbnailGenerationJobs.status, "pending"),
          or(
            isNull(thumbnailGenerationJobs.leaseExpiresAt),
            lte(thumbnailGenerationJobs.leaseExpiresAt, now),
          ),
        ),
      ),
    );
    const [candidate] = await transaction
      .select({ mediaId: thumbnailGenerationJobs.mediaId })
      .from(thumbnailGenerationJobs)
      .where(claimable)
      .orderBy(
        asc(thumbnailGenerationJobs.nextAttemptAt),
        asc(thumbnailGenerationJobs.createdAt),
      )
      .limit(1);

    if (!candidate) {
      return undefined;
    }

    const claimToken = randomUUID();
    const [claimed] = await transaction
      .update(thumbnailGenerationJobs)
      .set({
        status: "claimed",
        attempts: sql`${thumbnailGenerationJobs.attempts} + 1`,
        claimToken,
        leaseExpiresAt: new Date(now.getTime() + claimLeaseMs),
        startedAt: now,
        completedAt: null,
        updatedAt: now,
      })
      .where(
        and(eq(thumbnailGenerationJobs.mediaId, candidate.mediaId), claimable),
      )
      .returning();

    return claimed;
  });
};

export const scheduleThumbnailJobRetry = async ({
  mediaId,
  claimToken,
  reason,
  nextAttemptAt,
}: {
  mediaId: string;
  claimToken: string;
  reason: string;
  nextAttemptAt: Date;
}) =>
  updateClaimedJobStatus(mediaId, claimToken, "pending", {
    lastError: reason,
    downloadedPath: null,
    thumbnailPath: null,
    claimToken: null,
    leaseExpiresAt: null,
    nextAttemptAt,
  });

export const recoverThumbnailQueue = async () => {
  const now = new Date();

  await db
    .update(thumbnailGenerationJobs)
    .set({
      status: "pending",
      nextAttemptAt: now,
      updatedAt: now,
    })
    .where(
      and(
        isNonTerminalStatus(),
        ne(thumbnailGenerationJobs.status, "pending"),
        isNull(thumbnailGenerationJobs.claimToken),
        lt(thumbnailGenerationJobs.attempts, maximumThumbnailAttempts),
      ),
    );

  const exhaustedJobs = await db
    .update(thumbnailGenerationJobs)
    .set({
      status: "failed: maximum attempts reached",
      failureReason: "maximum attempts reached",
      completedAt: now,
      claimToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        isNonTerminalStatus(),
        sql`${thumbnailGenerationJobs.attempts} >= ${maximumThumbnailAttempts}`,
        or(
          isNull(thumbnailGenerationJobs.leaseExpiresAt),
          lte(thumbnailGenerationJobs.leaseExpiresAt, now),
        ),
      ),
    )
    .returning();

  return exhaustedJobs;
};

export const clearTerminalScratchPaths = async (mediaId: string) => {
  const [job] = await db
    .update(thumbnailGenerationJobs)
    .set({
      downloadedPath: null,
      thumbnailPath: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(thumbnailGenerationJobs.mediaId, mediaId),
        sql`${thumbnailGenerationJobs.status} like 'failed:%'`,
      ),
    )
    .returning();

  return job;
};

export const getNextThumbnailQueueWakeAt = async () => {
  const [row] = await db
    .select({
      pendingAt: sql<Date | null>`min(${thumbnailGenerationJobs.nextAttemptAt}) filter (where ${thumbnailGenerationJobs.status} = 'pending' and ${thumbnailGenerationJobs.attempts} < ${maximumThumbnailAttempts})`,
      leaseAt: sql<Date | null>`min(${thumbnailGenerationJobs.leaseExpiresAt}) filter (where ${thumbnailGenerationJobs.claimToken} is not null and ${thumbnailGenerationJobs.status} <> 'complete' and ${thumbnailGenerationJobs.status} not like 'failed:%')`,
    })
    .from(thumbnailGenerationJobs);

  const candidates = [row?.pendingAt, row?.leaseAt].filter(
    (value): value is Date => value instanceof Date,
  );

  if (candidates.length === 0) {
    return null;
  }

  return new Date(Math.min(...candidates.map((value) => value.getTime())));
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
  claimToken: string,
  statusCode: number,
) => {
  if (statusCode === 404) {
    return markClaimedJobFailed(mediaId, claimToken, "file not found in latex");
  }

  if (statusCode === 409) {
    return markClaimedJobFailed(mediaId, claimToken, "already complete");
  }

  return null;
};
