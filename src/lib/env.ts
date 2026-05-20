import path from "node:path";

export const getDownloadPath = () =>
  process.env.DOWNLOAD_PATH?.trim() ||
  path.join(process.cwd(), "data", "downloads");

export const getThumbnailPath = () =>
  process.env.THUMBNAIL_PATH?.trim() ||
  path.join(process.cwd(), "data", "thumbnails");

export const getIncomingApiSecret = () =>
  process.env.LATEX_INCOMING_API_SECRET_KEY?.trim() ?? "";

export const getOutgoingApiSecret = () =>
  process.env.LATEX_OUTGOING_API_SECRET_KEY?.trim() ?? "";

export const getLatexApiBaseUrl = () =>
  process.env.LATEX_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";

export const isDiagPageEnabled = () => process.env.ENABLE_DIAG_PAGE === "true";
