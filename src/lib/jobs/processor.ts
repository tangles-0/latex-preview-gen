import { readFile } from "node:fs/promises";

import { formatError } from "@/lib/errors";
import {
  getJob,
  getRetryableStartupJobs,
  incrementAttempts,
  markJobFailed,
  markLatexTerminalFailure,
  shouldStopRetrying,
  updateJobStatus,
} from "@/lib/jobs/repository";
import {
  LatexApiError,
  reportLatexStatus,
  uploadLatexThumbnail,
} from "@/lib/latex/client";
import { DownloadError, downloadSourceFile } from "@/lib/preview/download";
import { UnsupportedMediaTypeError } from "@/lib/preview/generatorRegistry";
import { generateThumbnail } from "@/lib/preview/generateThumbnail";
import { writeJpegThumbnail } from "@/lib/preview/output";
import { getYoutubeVideo } from "@/lib/youtube/repository";

const getErrorMessage = (error: unknown) => formatError(error);

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

const isTerminalLatexError = async (mediaId: string, error: unknown) => {
  if (error instanceof LatexApiError) {
    return Boolean(await markLatexTerminalFailure(mediaId, error.statusCode));
  }

  if (error instanceof DownloadError && error.statusCode === 404) {
    await markJobFailed(mediaId, "file not found in latex");
    return true;
  }

  if (error instanceof UnsupportedMediaTypeError) {
    await markJobFailed(mediaId, error.message);
    return true;
  }

  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;

  if (cause) {
    return isTerminalLatexError(mediaId, cause);
  }

  return false;
};

const reportFailureToLatex = async (mediaId: string, reason: string) => {
  try {
    await reportLatexStatus(mediaId, `error: ${reason}`);
  } catch (error) {
    await isTerminalLatexError(mediaId, error);
  }
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

const handleRetryableError = async (mediaId: string, error: unknown) => {
  const reason = getErrorMessage(error);
  const job = await incrementAttempts(mediaId, reason);

  if (!job || shouldStopRetrying(job.attempts)) {
    await markJobFailed(mediaId, reason);
    await reportFailureToLatex(mediaId, reason);
    return;
  }

  await updateJobStatus(mediaId, "pending", { lastError: reason });
  await processGenerationJob(mediaId);
};

export const processGenerationJob = async (mediaId: string): Promise<void> => {
  const job = await getJob(mediaId);

  if (!job || job.status === "complete" || job.status.startsWith("failed")) {
    return;
  }

  if (shouldStopRetrying(job.attempts)) {
    await markJobFailed(mediaId, job.lastError ?? "maximum attempts reached");
    return;
  }

  try {
    if (job.youtubeId) {
      const cachedThumbnail = await runJobStep(
        "using cached YouTube thumbnail",
        () => generateCachedYoutubeThumbnail(mediaId, job.youtubeId ?? ""),
      );

      if (cachedThumbnail) {
        await runJobStep("reporting started status to Latex", () =>
          reportLatexStatus(mediaId, "started"),
        );
        await updateJobStatus(mediaId, "started", { startedAt: new Date() });
        await updateJobStatus(mediaId, "created", {
          thumbnailPath: cachedThumbnail.thumbnailPath,
          generationDurationMs: cachedThumbnail.generationDurationMs,
          createdThumbnailAt: new Date(),
        });
        await updateJobStatus(mediaId, "uploading");
        const thumbnailBase64 = await runJobStep(
          "reading generated thumbnail",
          () => readFile(cachedThumbnail.thumbnailPath, "base64"),
        );

        await runJobStep("uploading thumbnail to Latex", () =>
          uploadLatexThumbnail({
            mediaId,
            thumbnailBase64,
            generationDurationMs: cachedThumbnail.generationDurationMs,
          }),
        );
        await updateJobStatus(mediaId, "complete", {
          completedAt: new Date(),
        });
        return;
      }
    }

    await updateJobStatus(mediaId, "downloading");
    const downloadedPath = await runJobStep("downloading source file", () =>
      downloadSourceFile({
        mediaId,
        downloadUrl: job.sourceUrl,
        mimeType: job.mimeType,
      }),
    );

    await updateJobStatus(mediaId, "downloaded", {
      downloadedPath,
      downloadedAt: new Date(),
    });

    await runJobStep("reporting started status to Latex", () =>
      reportLatexStatus(mediaId, "started"),
    );
    await updateJobStatus(mediaId, "started", { startedAt: new Date() });

    await updateJobStatus(mediaId, "creating");
    const { thumbnailPath, generationDurationMs } = await runJobStep(
      "generating thumbnail",
      () =>
        generateThumbnail({
          mediaId,
          sourcePath: downloadedPath,
          contentType: job.contentType,
          mimeType: job.mimeType,
          metadata: job.sourceMetadata,
        }),
    );

    await updateJobStatus(mediaId, "created", {
      thumbnailPath,
      generationDurationMs,
      createdThumbnailAt: new Date(),
    });

    await updateJobStatus(mediaId, "uploading");
    const thumbnailBase64 = await runJobStep(
      "reading generated thumbnail",
      () => readFile(thumbnailPath, "base64"),
    );

    await runJobStep("uploading thumbnail to Latex", () =>
      uploadLatexThumbnail({
        mediaId,
        thumbnailBase64,
        generationDurationMs,
      }),
    );

    await updateJobStatus(mediaId, "complete", {
      completedAt: new Date(),
    });
  } catch (error) {
    const isTerminal = await isTerminalLatexError(mediaId, error);

    if (!isTerminal) {
      await handleRetryableError(mediaId, error);
    }
  }
};

export const retryStartupJobs = async () => {
  const jobs = await getRetryableStartupJobs();

  await Promise.all(jobs.map((job) => processGenerationJob(job.mediaId)));
};
