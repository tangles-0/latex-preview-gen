import path from "node:path";

export const getDownloadPath = () =>
  process.env.DOWNLOAD_PATH?.trim() ||
  path.join(process.cwd(), "data", "downloads");

export const getThumbnailPath = () =>
  process.env.THUMBNAIL_PATH?.trim() ||
  path.join(process.cwd(), "data", "thumbnails");

export const getYoutubeDownloadPath = () =>
  process.env.YOUTUBE_DOWNLOAD_PATH?.trim() ||
  path.join(process.cwd(), "data", "youtube", "downloads");

export const getYoutubeThumbnailPath = () =>
  process.env.YOUTUBE_THUMBNAIL_PATH?.trim() ||
  path.join(process.cwd(), "data", "youtube", "thumbnails");

export const getYtdlpBinary = () =>
  `${process.env.YT_DLP_BINARY_PATH?.trim() || path.join(process.cwd(), "binaries")}/${process.env.YT_DLP_BINARY?.trim() || "yt-dlp_linux"}`;

export const getIncomingApiSecret = () =>
  process.env.LATEX_INCOMING_API_SECRET_KEY?.trim() ?? "";

export const getOutgoingApiSecret = () =>
  process.env.LATEX_OUTGOING_API_SECRET_KEY?.trim() ?? "";

export const getLatexApiBaseUrl = () =>
  process.env.LATEX_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";

export const isDiagPageEnabled = () => process.env.ENABLE_DIAG_PAGE === "true";
