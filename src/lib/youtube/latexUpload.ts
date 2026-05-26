import { open, stat } from "node:fs/promises";
import path from "node:path";

import { uploadPart as uploadBlobPart } from "@vercel/blob/client";

import { postLatexBinary, requestLatexJson } from "@/lib/latex/client";

const defaultChunkSize = 8 * 1024 * 1024;

type InitUploadResponse = {
  sessionId: string;
  chunkSize: number;
  totalParts: number;
  uploadedParts: Record<string, string>;
  storageKey?: string;
  multipart?: {
    token: string;
    key: string;
    uploadId: string;
  };
};

type CompleteUploadResponse = {
  sessionId: string;
  state: "complete";
  media?: {
    id?: string;
    kind?: string;
    youtubeId?: string;
  };
};

const sanitizeFileName = (title: string, extension: string) => {
  const safeTitle = title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return `${safeTitle || "YouTube video"}${extension}`;
};

const ackUploadedPart = async ({
  userId,
  sessionId,
  partNumber,
  etag,
}: {
  userId: string;
  sessionId: string;
  partNumber: number;
  etag: string;
}) => {
  await requestLatexJson<{ etag: string; partNumber: number }>(
    "/api/uploads/part",
    {
      userId,
      sessionId,
      partNumber,
      etag,
    },
  );
};

export const uploadYoutubeVideoToLatex = async ({
  ingestId,
  userId,
  youtubeId,
  title,
  filePath,
  mimeType,
  onProgress,
}: {
  ingestId: string;
  userId: string;
  youtubeId: string;
  title: string;
  filePath: string;
  mimeType: string;
  onProgress: (progress: number) => Promise<void>;
}) => {
  const fileStats = await stat(filePath);
  const fileSize = fileStats.size;
  const fileName = sanitizeFileName(title, path.extname(filePath) || ".mp4");
  const initResponse = await requestLatexJson<InitUploadResponse>(
    "/api/uploads/init",
    {
      userId,
      fileName,
      fileSize,
      mimeType,
      chunkSize: defaultChunkSize,
      targetType: "video",
    },
  );
  const chunkSize = initResponse.chunkSize || defaultChunkSize;
  const totalParts = initResponse.totalParts || Math.ceil(fileSize / chunkSize);
  const file = await open(filePath, "r");

  try {
    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      if (initResponse.uploadedParts?.[String(partNumber)]) {
        await onProgress(
          Math.min(99, Math.round((partNumber / totalParts) * 100)),
        );
        continue;
      }

      const offset = (partNumber - 1) * chunkSize;
      const length = Math.min(chunkSize, fileSize - offset);
      const buffer = Buffer.alloc(length);
      await file.read(buffer, 0, length, offset);

      if (initResponse.multipart) {
        if (!initResponse.storageKey) {
          throw new Error(
            "Latex upload init returned multipart metadata without a storage key.",
          );
        }

        const uploadedPart = await uploadBlobPart(
          initResponse.storageKey,
          buffer,
          {
            access: "private",
            token: initResponse.multipart.token,
            key: initResponse.multipart.key,
            uploadId: initResponse.multipart.uploadId,
            partNumber,
            contentType: mimeType,
          },
        );

        await ackUploadedPart({
          userId,
          sessionId: initResponse.sessionId,
          partNumber,
          etag: uploadedPart.etag,
        });
      } else {
        await postLatexBinary({
          path: "/api/uploads/part",
          body: buffer,
          headers: {
            "x-upload-user-id": userId,
            "x-upload-session-id": initResponse.sessionId,
            "x-upload-part-number": String(partNumber),
          },
        });
      }

      await onProgress(
        Math.min(99, Math.round((partNumber / totalParts) * 100)),
      );
    }
  } finally {
    await file.close();
  }

  const completeResponse = await requestLatexJson<CompleteUploadResponse>(
    "/api/uploads/complete",
    {
      userId,
      sessionId: initResponse.sessionId,
      expectedTotalParts: totalParts,
      youtubeIngestId: ingestId,
      youtubeId,
      title,
    },
  );

  return {
    fileName,
    fileSize,
    mediaId: completeResponse.media?.id,
  };
};
