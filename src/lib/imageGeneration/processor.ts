import { rm } from "node:fs/promises";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { formatError } from "@/lib/errors";
import { generateImage } from "@/lib/imageGeneration/generator";
import { expandImagePrompt } from "@/lib/imageGeneration/expandPrompt";
import { uploadGeneratedImageToLatex } from "@/lib/imageGeneration/latexUpload";
import {
  getRemainingImageGenerationTimeMs,
  imageGenerationMaxAgeMs,
} from "@/lib/imageGeneration/policy";
import {
  claimNextImageGenerationJob,
  expireImageGenerationJob,
  getImageGenerationJob,
  listExpiredImageGenerationJobs,
  resetInterruptedImageGenerationJobs,
  updateImageGenerationJob,
} from "@/lib/imageGeneration/repository";
import { LatexApiError, reportImageGenerationStatus } from "@/lib/latex/client";

const uploadGraceMs = 5_000;
const advisoryLockKey = 1_945_582_073;

type QueueState = {
  promise?: Promise<void>;
  shouldRunAgain: boolean;
};

const globalForQueue = globalThis as unknown as {
  imageGenerationQueue?: QueueState;
};

const queueState =
  globalForQueue.imageGenerationQueue ??
  ({
    shouldRunAgain: false,
  } satisfies QueueState);

globalForQueue.imageGenerationQueue = queueState;

const reportStatus = async ({
  generationId,
  status,
  error,
}: {
  generationId: string;
  status: "generating" | "uploading" | "complete" | "failed";
  error?: string;
}) => {
  try {
    await reportImageGenerationStatus({ generationId, status, error });
    return true;
  } catch (statusError) {
    if (
      statusError instanceof LatexApiError &&
      statusError.statusCode === 404
    ) {
      return false;
    }

    throw statusError;
  }
};

const failJob = async (generationId: string, reason: string) => {
  await updateImageGenerationJob(generationId, "failed", {
    failureReason: reason,
    completedAt: new Date(),
  });

  try {
    await reportStatus({
      generationId,
      status: "failed",
      error: reason,
    });
  } catch {
    // The worker DB remains the source of truth when Latex is unreachable.
  }
};

const expireStaleJobs = async () => {
  const cutoff = new Date(Date.now() - imageGenerationMaxAgeMs);
  const staleJobs = await listExpiredImageGenerationJobs(cutoff);

  for (const staleJob of staleJobs) {
    const expired = await expireImageGenerationJob(
      staleJob.generationId,
      cutoff,
    );

    if (expired) {
      try {
        await reportStatus({
          generationId: expired.generationId,
          status: "failed",
          error: expired.failureReason ?? undefined,
        });
      } catch {
        // A later status poll still exposes the terminal worker state.
      }
    }
  }
};

const processJob = async (
  job: NonNullable<Awaited<ReturnType<typeof claimNextImageGenerationJob>>>,
) => {
  const generationId = job.generationId;

  try {
    const canGenerate = await reportStatus({
      generationId,
      status: "generating",
    });

    if (!canGenerate) {
      await failJob(generationId, "Image generation request no longer exists.");
      return;
    }

    const remainingMs = getRemainingImageGenerationTimeMs(job.createdAt);

    if (remainingMs <= uploadGraceMs) {
      await failJob(
        generationId,
        "Image generation exceeded the one-minute time limit.",
      );
      return;
    }

    let promptForModel = job.expandedPrompt?.trim() || job.prompt;
    if (job.expandPrompt && !job.expandedPrompt?.trim()) {
      const expandTimeoutMs = Math.min(
        15_000,
        remainingMs - uploadGraceMs - 5_000,
      );
      if (expandTimeoutMs < 2_000) {
        await failJob(
          generationId,
          "Not enough time remaining to expand the prompt.",
        );
        return;
      }

      promptForModel = await expandImagePrompt({
        prompt: job.prompt,
        timeoutMs: expandTimeoutMs,
      });
      await updateImageGenerationJob(generationId, "generating", {
        expandedPrompt: promptForModel,
      });
    }

    const remainingAfterExpandMs = getRemainingImageGenerationTimeMs(
      job.createdAt,
    );
    if (remainingAfterExpandMs <= uploadGraceMs) {
      await failJob(
        generationId,
        "Image generation exceeded the one-minute time limit.",
      );
      return;
    }

    const outputPath = await generateImage({
      generationId,
      prompt: promptForModel,
      negativePrompt: job.negativePrompt,
      timeoutMs: remainingAfterExpandMs - uploadGraceMs,
    });
    const currentJob = await getImageGenerationJob(generationId);

    if (!currentJob || currentJob.status === "failed") {
      await rm(outputPath, { force: true });
      return;
    }

    if (
      Date.now() - currentJob.createdAt.getTime() >=
      imageGenerationMaxAgeMs - uploadGraceMs
    ) {
      await rm(outputPath, { force: true });
      await failJob(
        generationId,
        "Image generation exceeded the one-minute time limit.",
      );
      return;
    }

    await updateImageGenerationJob(generationId, "uploading", {
      outputPath,
    });
    const canUpload = await reportStatus({
      generationId,
      status: "uploading",
    });

    if (!canUpload) {
      await failJob(generationId, "Image generation request no longer exists.");
      return;
    }

    const upload = await uploadGeneratedImageToLatex({
      generationId,
      userId: job.userId,
      prompt: job.prompt,
      generationPrompt: promptForModel,
      filePath: outputPath,
    });

    if (!upload.mediaId) {
      throw new Error("Latex did not return the generated image media ID.");
    }

    await rm(outputPath, { force: true }).catch(() => {});
    await updateImageGenerationJob(generationId, "complete", {
      outputPath: null,
      uploadedMediaId: upload.mediaId,
      completedAt: new Date(),
    });
    await reportStatus({ generationId, status: "complete" });
  } catch (error) {
    const currentJob = await getImageGenerationJob(generationId);
    if (currentJob?.outputPath) {
      await rm(currentJob.outputPath, { force: true }).catch(() => {});
    }
    await failJob(generationId, formatError(error));
  }
};

const drainQueue = async () => {
  const didAcquireLock = await db.transaction(async (transaction) => {
    const lockResult = await transaction.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(${advisoryLockKey}) as acquired`,
    );

    if (!lockResult[0]?.acquired) {
      return false;
    }

    await expireStaleJobs();
    await resetInterruptedImageGenerationJobs();

    while (true) {
      const job = await claimNextImageGenerationJob();

      if (!job) {
        break;
      }

      await processJob(job);
      await expireStaleJobs();
    }

    return true;
  });

  if (!didAcquireLock) {
    setTimeout(() => {
      void dispatchImageGenerationQueue();
    }, 1_000);
  }
};

export const dispatchImageGenerationQueue = () => {
  if (queueState.promise) {
    queueState.shouldRunAgain = true;
    return queueState.promise;
  }

  queueState.promise = drainQueue().finally(() => {
    queueState.promise = undefined;

    if (queueState.shouldRunAgain) {
      queueState.shouldRunAgain = false;
      void dispatchImageGenerationQueue();
    }
  });

  return queueState.promise;
};
