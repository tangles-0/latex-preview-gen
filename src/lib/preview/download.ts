import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import path from "node:path";

import { formatError } from "@/lib/errors";
import { getDownloadPath, getOutgoingApiSecret } from "@/lib/env";
import { getExtensionForFile, safeMediaFileName } from "@/lib/preview/paths";

export class DownloadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "DownloadError";
    this.statusCode = statusCode;
  }
}

export const downloadSourceFile = async ({
  mediaId,
  downloadUrl,
  mimeType,
}: {
  mediaId: string;
  downloadUrl: string;
  mimeType: string;
}) => {
  const downloadDirectory = getDownloadPath();
  await mkdir(downloadDirectory, { recursive: true });

  let response: Response;

  try {
    response = await fetch(downloadUrl, {
      headers: {
        Authorization: getOutgoingApiSecret(),
      },
    });
  } catch (error) {
    throw new Error(
      `Download request failed for ${downloadUrl}: ${formatError(error)}`,
    );
  }

  if (!response.ok) {
    throw new DownloadError(
      `Download failed with HTTP ${response.status}`,
      response.status,
    );
  }

  if (!response.body) {
    throw new Error("Download response did not include a body.");
  }

  const extension = getExtensionForFile({ mimeType });
  const filePath = path.join(
    downloadDirectory,
    safeMediaFileName(mediaId, extension),
  );

  try {
    await pipeline(
      Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
      createWriteStream(filePath),
    );
  } catch (error) {
    await rm(filePath, { force: true }).catch(() => {});
    throw error;
  }

  return filePath;
};
