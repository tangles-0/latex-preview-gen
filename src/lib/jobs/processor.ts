import { readFile } from "node:fs/promises";

import { formatError } from "@/lib/errors";
import { getPreviewConcurrency } from "@/lib/env";
import { cleanupThumbnailScratchFiles } from "@/lib/jobs/cleanup";
import { resolveLocalSourcePath } from "@/lib/jobs/localPaths";
import { getRetryDelayMs, runWorkerPool } from "@/lib/jobs/queuePolicy";
import {
  claimNextThumbnailJob,
  clearTerminalScratchPaths,
  getNextThumbnailQueueWakeAt,
  markClaimedJobFailed,
  maximumThumbnailAttempts,
  recoverThumbnailQueue,
  renewThumbnailJobClaim,
  scheduleThumbnailJobRetry,
  updateClaimedJobStatus,
} from "@/lib/jobs/repository";
import {
  LatexApiError,
  reportLatexStatus,
  uploadLatexThumbnail,
  uploadLatexThumbnailPath,
} from "@/lib/latex/client";
import { DownloadError, downloadSourceFile } from "@/lib/preview/download";
import { UnsupportedMediaTypeError } from "@/lib/preview/generatorRegistry";
import { generateThumbnail } from "@/lib/preview/generateThumbnail";
import { writeJpegThumbnail } from "@/lib/preview/output";
import { getYoutubeVideo } from "@/lib/youtube/repository";

const claimHeartbeatMs = 20_000;
const minimumQueueWakeDelayMs = 1_000;

type ClaimedThumbnailJob = NonNullable<
  Awaited<ReturnType<typeof claimNextThumbnailJob>>
>;

type QueueState = {
  promise?: Promise<void>;
  shouldRunAgain: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForQueue = globalThis as unknown as {
  thumbnailQueue?: QueueState;
};

const queueState =
  globalForQueue.thumbnailQueue ??
  ({
    shouldRunAgain: false,
  } satisfies QueueState);

globalForQueue.thumbnailQueue = queueState;

class ThumbnailClaimLostError extends Error {
  constructor(mediaId: string) {
    super(`Thumbnail job claim was lost for ${mediaId}.`);
    this.name = "ThumbnailClaimLostError";
  }
}

const runJobStep = async <Result>(
  stepName: string,
  callback: () => Promise<Result>,
) => {
  try {
    return await callback();
  } catch (error) {
    throw new Error(`${stepName} failed: ${formatError(error)}`, {
      cause: error,
    });
  }
};

const findTerminalFailureReason = (error: unknown): string | null => {
  if (error instanceof LatexApiError) {
    if (error.statusCode === 404) {
      return "file not found in latex";
    }

    if (error.statusCode === 409) {
      return "already complete";
    }
  }

  if (error instanceof DownloadError && error.statusCode === 404) {
    return "file not found in latex";
  }

  if (error instanceof UnsupportedMediaTypeError) {
    return error.message;
  }

  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;

  return cause ? findTerminalFailureReason(cause) : null;
};

const reportFailureToLatex = async (mediaId: string, reason: string) => {
  try {
    await reportLatexStatus(mediaId, `error: ${reason}`);
  } catch {
    // PostgreSQL remains the source of truth while the app is unreachable.
  }
};

const requireClaim = <Job>(
  mediaId: string,
  job: Job | undefined,
): NonNullable<Job> => {
  if (!job) {
    throw new ThumbnailClaimLostError(mediaId);
  }

  return job;
};

const generateCachedYoutubeThumbnail = async (
  mediaId: string,
  youtubeId: string,
) => {
  const video = await getYoutubeVideo(youtubeId);

  if (!video?.thumbnailPath) {
    return null;
  }

  const startedAt = performance.now();
  const thumbnailPath = await writeJpegThumbnail({
    mediaId,
    input: video.thumbnailPath,
  });

  return {
    thumbnailPath,
    generationDurationMs: Math.round(performance.now() - startedAt),
  };
};

const processClaimedThumbnailJob = async (job: ClaimedThumbnailJob) => {
  const { mediaId, claimToken } = job;

  if (!claimToken) {
    return;
  }

  let downloadedPath: string | null = null;
  let thumbnailPath: string | null = null;
  let hasLostClaim = false;
  const heartbeat = setInterval(() => {
    void renewThumbnailJobClaim(mediaId, claimToken)
      .then((renewedJob) => {
        if (!renewedJob) {
          hasLostClaim = true;
        }
      })
      .catch(() => {
        // A step update or the next heartbeat will retry the database boundary.
      });
  }, claimHeartbeatMs);
  heartbeat.unref();

  const updateStatus = async (
    status: string,
    fields: Parameters<typeof updateClaimedJobStatus>[3] = {},
  ) => {
    if (hasLostClaim) {
      throw new ThumbnailClaimLostError(mediaId);
    }

    return requireClaim(
      mediaId,
      await updateClaimedJobStatus(mediaId, claimToken, status, fields),
    );
  };

  const renewClaim = async () => {
    if (hasLostClaim) {
      throw new ThumbnailClaimLostError(mediaId);
    }

    requireClaim(mediaId, await renewThumbnailJobClaim(mediaId, claimToken));
  };

  const uploadAndComplete = async (
    generatedPath: string,
    generationDurationMs: number,
  ) => {
    await updateStatus("uploading");
    await renewClaim();
    if (job.localSourcePath) {
      await runJobStep("registering local thumbnail with Latex", () =>
        uploadLatexThumbnailPath({
          mediaId,
          thumbnailPath: generatedPath,
          generationDurationMs,
        }),
      );
    } else {
      const thumbnailBase64 = await runJobStep(
        "reading generated thumbnail",
        () => readFile(generatedPath, "base64"),
      );
      await runJobStep("uploading thumbnail to Latex", () =>
        uploadLatexThumbnail({
          mediaId,
          thumbnailBase64,
          generationDurationMs,
        }),
      );
    }
    await updateStatus("complete", {
      downloadedPath: null,
      thumbnailPath: null,
      claimToken: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
    });
  };

  try {
    await cleanupThumbnailScratchFiles({
      downloadedPath: job.downloadedPath,
      thumbnailPath: job.thumbnailPath,
    });
    await updateStatus("claimed", {
      downloadedPath: null,
      thumbnailPath: null,
    });

    if (job.youtubeId) {
      const cachedThumbnail = await runJobStep(
        "using cached YouTube thumbnail",
        () => generateCachedYoutubeThumbnail(mediaId, job.youtubeId ?? ""),
      );

      if (cachedThumbnail) {
        thumbnailPath = cachedThumbnail.thumbnailPath;
        await runJobStep("reporting started status to Latex", () =>
          reportLatexStatus(mediaId, "started"),
        );
        await updateStatus("created", {
          thumbnailPath,
          generationDurationMs: cachedThumbnail.generationDurationMs,
          createdThumbnailAt: new Date(),
        });
        await uploadAndComplete(
          thumbnailPath,
          cachedThumbnail.generationDurationMs,
        );
        return;
      }
    }

    let sourcePath: string;

    if (job.localSourcePath) {
      await updateStatus("reading-local");
      sourcePath = await runJobStep("validating local source file", () =>
        resolveLocalSourcePath(job.localSourcePath ?? ""),
      );
    } else if (job.sourceUrl) {
      await updateStatus("downloading");
      downloadedPath = await runJobStep("downloading source file", () =>
        downloadSourceFile({
          mediaId,
          downloadUrl: job.sourceUrl ?? "",
          mimeType: job.mimeType,
        }),
      );
      sourcePath = downloadedPath;
      await updateStatus("downloaded", {
        downloadedPath,
        downloadedAt: new Date(),
      });
    } else {
      throw new Error("Thumbnail job does not have a source.");
    }

    await runJobStep("reporting started status to Latex", () =>
      reportLatexStatus(mediaId, "started"),
    );
    await updateStatus("creating", { startedAt: new Date() });
    const generatedThumbnail = await runJobStep("generating thumbnail", () =>
      generateThumbnail({
        mediaId,
        sourcePath,
        contentType: job.contentType,
        mimeType: job.mimeType,
        metadata: job.sourceMetadata,
      }),
    );
    thumbnailPath = generatedThumbnail.thumbnailPath;

    await updateStatus("created", {
      thumbnailPath,
      generationDurationMs: generatedThumbnail.generationDurationMs,
      createdThumbnailAt: new Date(),
    });
    await uploadAndComplete(
      thumbnailPath,
      generatedThumbnail.generationDurationMs,
    );
  } catch (error) {
    if (error instanceof ThumbnailClaimLostError) {
      return;
    }

    const terminalReason = findTerminalFailureReason(error);
    const reason = terminalReason ?? formatError(error);
    const isTerminal =
      Boolean(terminalReason) || job.attempts >= maximumThumbnailAttempts;

    try {
      if (isTerminal) {
        const failedJob = await markClaimedJobFailed(
          mediaId,
          claimToken,
          reason,
        );

        if (failedJob) {
          await reportFailureToLatex(mediaId, reason);
        }
      } else {
        const nextAttemptAt = new Date(
          Date.now() + getRetryDelayMs(job.attempts),
        );
        await scheduleThumbnailJobRetry({
          mediaId,
          claimToken,
          reason,
          nextAttemptAt,
        });
      }
    } catch (persistenceError) {
      console.error(
        `Unable to persist thumbnail failure for ${mediaId}`,
        persistenceError,
      );
    }
  } finally {
    clearInterval(heartbeat);
    await cleanupThumbnailScratchFiles({
      downloadedPath,
      thumbnailPath,
    });
  }
};

const scheduleNextQueueWake = async () => {
  const wakeAt = await getNextThumbnailQueueWakeAt();

  if (!wakeAt || queueState.timer) {
    return;
  }

  const delayMs = Math.max(
    minimumQueueWakeDelayMs,
    wakeAt.getTime() - Date.now(),
  );
  queueState.timer = setTimeout(() => {
    queueState.timer = undefined;
    void dispatchThumbnailQueue();
  }, delayMs);
  queueState.timer.unref();
};

const recoverQueue = async () => {
  const exhaustedJobs = await recoverThumbnailQueue();

  for (const job of exhaustedJobs) {
    await cleanupThumbnailScratchFiles({
      downloadedPath: job.downloadedPath,
      thumbnailPath: job.thumbnailPath,
    });
    await clearTerminalScratchPaths(job.mediaId);
    await reportFailureToLatex(
      job.mediaId,
      job.failureReason ?? "maximum attempts reached",
    );
  }
};

const drainQueue = async () => {
  const concurrency = getPreviewConcurrency();

  await recoverQueue();
  await runWorkerPool({
    concurrency,
    claim: () => claimNextThumbnailJob(concurrency),
    process: processClaimedThumbnailJob,
  });
  await scheduleNextQueueWake();
};

export const dispatchThumbnailQueue = () => {
  if (queueState.timer) {
    clearTimeout(queueState.timer);
    queueState.timer = undefined;
  }

  if (queueState.promise) {
    queueState.shouldRunAgain = true;
    return queueState.promise;
  }

  queueState.promise = drainQueue()
    .catch((error) => {
      console.error("Thumbnail queue drain failed", error);

      if (!queueState.timer) {
        queueState.timer = setTimeout(() => {
          queueState.timer = undefined;
          void dispatchThumbnailQueue();
        }, minimumQueueWakeDelayMs);
        queueState.timer.unref();
      }
    })
    .finally(() => {
      queueState.promise = undefined;

      if (queueState.shouldRunAgain) {
        queueState.shouldRunAgain = false;
        void dispatchThumbnailQueue();
      }
    });

  return queueState.promise;
};

export const startThumbnailQueue = async () => {
  try {
    await dispatchThumbnailQueue();
  } catch (error) {
    console.error("Thumbnail queue startup recovery failed", error);

    if (!queueState.timer) {
      queueState.timer = setTimeout(() => {
        queueState.timer = undefined;
        void startThumbnailQueue();
      }, minimumQueueWakeDelayMs);
      queueState.timer.unref();
    }
  }
};
