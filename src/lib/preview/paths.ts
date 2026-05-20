const mimeTypeExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
  "video/x-msvideo": ".avi",
  "video/mpeg": ".mpeg",
  "video/x-ms-wmv": ".wmv",
  "video/x-flv": ".flv",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
  "application/vnd.oasis.opendocument.text": ".odt",
  "application/vnd.oasis.opendocument.spreadsheet": ".ods",
  "application/vnd.oasis.opendocument.presentation": ".odp",
  "application/rtf": ".rtf",
  "text/markdown": ".md",
  "text/plain": ".txt",
  "application/zip": ".zip",
};

export const safeMediaFileName = (mediaId: string, extension = "") => {
  const safeMediaId = mediaId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeMediaId}${extension}`;
};

export const getExtensionForFile = ({ mimeType }: { mimeType: string }) => {
  return mimeTypeExtensions[mimeType.toLowerCase()] ?? "";
};
