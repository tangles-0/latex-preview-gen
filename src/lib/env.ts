import path from "node:path";

import { parsePreviewConcurrency } from "@/lib/jobs/queuePolicy";

export const getDownloadPath = () =>
  process.env.DOWNLOAD_PATH?.trim() ||
  path.join(process.cwd(), "data", "downloads");

export const getThumbnailPath = () =>
  process.env.THUMBNAIL_PATH?.trim() ||
  path.join(process.cwd(), "data", "thumbnails");

export const getNodeLibraryPath = () =>
  process.env.NODE_LIBRARY_PATH?.trim() || null;

export const getPreviewConcurrency = () =>
  parsePreviewConcurrency(process.env.PREVIEW_CONCURRENCY);

export const getYoutubeDownloadPath = () =>
  process.env.YOUTUBE_DOWNLOAD_PATH?.trim() ||
  path.join(process.cwd(), "data", "youtube", "downloads");

export const getYoutubeThumbnailPath = () =>
  process.env.YOUTUBE_THUMBNAIL_PATH?.trim() ||
  path.join(process.cwd(), "data", "youtube", "thumbnails");

export const getImageGenerationApiUrl = () =>
  (
    process.env.IMAGE_GENERATION_API_URL?.trim() || "http://ubuntu-server:7861"
  ).replace(/\/$/, "");

export const getImageGenerationPath = () =>
  process.env.IMAGE_GENERATION_PATH?.trim() ||
  path.join(process.cwd(), "data", "image-generations");

export const isImageGenerationEnabled = () =>
  process.env.IMAGE_GENERATION_ENABLED !== "false";

export const getLiteLlmApiUrl = () =>
  (process.env.LITE_LLM_API_URL?.trim() || "").replace(/\/$/, "");

export const getLiteLlmApiKey = () =>
  process.env.LITE_LLM_API_KEY?.trim() ?? "";

export const getLiteLlmModel = () => process.env.LITE_LLM_MODEL?.trim() ?? "";

export const isLiteLlmConfigured = () =>
  Boolean(getLiteLlmApiUrl() && getLiteLlmModel());

export const getYtdlpBinaryName = () =>
  process.env.YT_DLP_BINARY?.trim() || "yt-dlp-wrapper.sh";

export const getYtdlpBinaryDirectory = () =>
  process.env.YT_DLP_BINARY_PATH?.trim() ||
  path.join(process.cwd(), "binaries");

export const getYtdlpBinary = () =>
  path.resolve(getYtdlpBinaryDirectory(), getYtdlpBinaryName());

export const getYtdlpReleaseBinary = () => {
  const configuredPath = process.env.YT_DLP_REAL_BINARY?.trim();
  return configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(getYtdlpBinaryDirectory(), "yt-dlp_linux");
};

export const getYtdlpReleaseBinaryName = () =>
  path.basename(getYtdlpReleaseBinary());

export const getIncomingApiSecret = () =>
  process.env.LATEX_INCOMING_API_SECRET_KEY?.trim() ?? "";

export const getOutgoingApiSecret = () =>
  process.env.LATEX_OUTGOING_API_SECRET_KEY?.trim() ?? "";

export const getLatexApiBaseUrl = () =>
  process.env.LATEX_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";

export const isDiagPageEnabled = () => process.env.ENABLE_DIAG_PAGE === "true";
