import { formatError } from "@/lib/errors";
import { LatexApiError, reportYoutubeIngestStatus } from "@/lib/latex/client";
import {
  downloadYoutubeMedia,
  mimeTypeForYoutubeOutput,
} from "@/lib/youtube/download";
import { uploadYoutubeMediaToLatex } from "@/lib/youtube/latexUpload";
import {
  getYoutubeVideo,
  updateYoutubeIngestStatus,
} from "@/lib/youtube/repository";
import type { YoutubeOutputType } from "@/lib/youtube/types";

const reportStatus = async ({
  ingestId,
  status,
  progress,
  error,
}: {
  ingestId: string;
  status: "downloading" | "uploading" | "complete" | "error";
  progress: number;
  error?: string;
}) => {
  try {
    await reportYoutubeIngestStatus({ ingestId, status, progress, error });
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

const failYoutubeIngest = async (
  ingestId: string,
  progress: number,
  error: string,
) => {
  await updateYoutubeIngestStatus(ingestId, "error", {
    progress,
    error,
    completedAt: new Date(),
  });
  await reportStatus({ ingestId, status: "error", progress, error });
};

export const processYoutubeIngest = async ({
  ingestId,
  userId,
  youtubeId,
  qualityId,
  outputType,
}: {
  ingestId: string;
  userId: string;
  youtubeId: string;
  qualityId?: string;
  outputType: YoutubeOutputType;
}) => {
  let progress = 0;

  try {
    const video = await getYoutubeVideo(youtubeId);

    if (!video) {
      throw new Error(`YouTube metadata was not found for ${youtubeId}.`);
    }

    await updateYoutubeIngestStatus(ingestId, "downloading", { progress });
    const shouldContinue = await reportStatus({
      ingestId,
      status: "downloading",
      progress,
    });

    if (!shouldContinue) {
      return;
    }

    const downloadedPath = await downloadYoutubeMedia({
      ingestId,
      url: video.sourceUrl,
      qualityId,
      outputType,
      onProgress: async (nextProgress) => {
        progress = Math.max(progress, Math.min(99, nextProgress));
        await updateYoutubeIngestStatus(ingestId, "downloading", { progress });
        await reportStatus({ ingestId, status: "downloading", progress });
      },
    });
    const mimeType = mimeTypeForYoutubeOutput(downloadedPath, outputType);

    await updateYoutubeIngestStatus(ingestId, "uploading", {
      progress: 0,
      downloadedPath,
      mimeType,
    });
    progress = 0;
    const canUpload = await reportStatus({
      ingestId,
      status: "uploading",
      progress,
    });

    if (!canUpload) {
      return;
    }

    const uploadResult = await uploadYoutubeMediaToLatex({
      ingestId,
      userId,
      youtubeId,
      title: video.title,
      filePath: downloadedPath,
      mimeType,
      outputType,
      onProgress: async (nextProgress) => {
        progress = Math.max(progress, Math.min(99, nextProgress));
        await updateYoutubeIngestStatus(ingestId, "uploading", { progress });
        await reportStatus({ ingestId, status: "uploading", progress });
      },
    });

    await updateYoutubeIngestStatus(ingestId, "complete", {
      progress: 100,
      uploadedMediaId: uploadResult.mediaId ?? null,
      fileName: uploadResult.fileName,
      fileSizeBytes: uploadResult.fileSize,
      completedAt: new Date(),
    });
    await reportStatus({ ingestId, status: "complete", progress: 100 });
  } catch (error) {
    await failYoutubeIngest(ingestId, progress, formatError(error));
  }
};
