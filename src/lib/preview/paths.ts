const mimeTypeExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "application/pdf": ".pdf",
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
