import { formatError } from "@/lib/errors";
import { getLatexApiBaseUrl, getOutgoingApiSecret } from "@/lib/env";

type LatexStatus = "started" | `error: ${string}`;
type YoutubeIngestStatus = "downloading" | "uploading" | "complete" | "error";
type ImageGenerationStatus = "generating" | "uploading" | "complete" | "failed";

export class LatexApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "LatexApiError";
    this.statusCode = statusCode;
  }
}

const getLatexEndpoint = (mediaId: string, action: "status" | "thumbnail") => {
  const baseUrl = getLatexApiBaseUrl();

  if (!baseUrl) {
    throw new Error("LATEX_API_BASE_URL is not set.");
  }

  const encodedMediaId = encodeURIComponent(mediaId);
  return action === "status"
    ? `${baseUrl}/api/thumbnails/${encodedMediaId}/status`
    : `${baseUrl}/api/thumbnails/${encodedMediaId}`;
};

const requestLatex = async (
  url: string,
  body: Record<string, unknown>,
): Promise<Response> => {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: getOutgoingApiSecret(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(
      `Latex API request to ${url} failed: ${formatError(error)}`,
    );
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const message =
      responseText || `Latex API returned HTTP ${response.status}`;
    throw new LatexApiError(message, response.status);
  }

  return response;
};

export const requestLatexJson = async <ResponseBody>(
  path: string,
  body: Record<string, unknown>,
) => {
  const baseUrl = getLatexApiBaseUrl();

  if (!baseUrl) {
    throw new Error("LATEX_API_BASE_URL is not set.");
  }

  const response = await requestLatex(`${baseUrl}${path}`, body);
  return (await response.json()) as ResponseBody;
};

export const postLatexJson = async (
  path: string,
  body: Record<string, unknown>,
) => {
  const baseUrl = getLatexApiBaseUrl();

  if (!baseUrl) {
    throw new Error("LATEX_API_BASE_URL is not set.");
  }

  await requestLatex(`${baseUrl}${path}`, body);
};

export const postLatexBinary = async ({
  path,
  body,
  headers,
}: {
  path: string;
  body: Buffer;
  headers: Record<string, string>;
}) => {
  const baseUrl = getLatexApiBaseUrl();

  if (!baseUrl) {
    throw new Error("LATEX_API_BASE_URL is not set.");
  }

  const url = `${baseUrl}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: getOutgoingApiSecret(),
        "Content-Type": "application/octet-stream",
        ...headers,
      },
      body: body as unknown as BodyInit,
    });
  } catch (error) {
    throw new Error(
      `Latex API request to ${url} failed: ${formatError(error)}`,
    );
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const message =
      responseText || `Latex API returned HTTP ${response.status}`;
    throw new LatexApiError(message, response.status);
  }

  return response;
};

export const reportLatexStatus = async (
  mediaId: string,
  status: LatexStatus,
) => {
  await requestLatex(getLatexEndpoint(mediaId, "status"), {
    mediaId,
    status,
  });
};

export const uploadLatexThumbnail = async ({
  mediaId,
  thumbnailBase64,
  generationDurationMs,
}: {
  mediaId: string;
  thumbnailBase64: string;
  generationDurationMs: number;
}) => {
  await requestLatex(getLatexEndpoint(mediaId, "thumbnail"), {
    mediaId,
    thumbnailBase64,
    contentType: "image/jpeg",
    generationDurationMs,
  });
};

export const uploadLatexThumbnailPath = async ({
  mediaId,
  thumbnailPath,
  generationDurationMs,
}: {
  mediaId: string;
  thumbnailPath: string;
  generationDurationMs: number;
}) => {
  await requestLatex(getLatexEndpoint(mediaId, "thumbnail"), {
    mediaId,
    thumbnailPath,
    contentType: "image/jpeg",
    generationDurationMs,
  });
};

export const reportYoutubeIngestStatus = async ({
  ingestId,
  status,
  progress,
  error,
}: {
  ingestId: string;
  status: YoutubeIngestStatus;
  progress: number;
  error?: string;
}) => {
  await postLatexJson(
    `/api/youtube/ingests/${encodeURIComponent(ingestId)}/status`,
    {
      status,
      progress,
      ...(error ? { error } : {}),
    },
  );
};

export const reportImageGenerationStatus = async ({
  generationId,
  status,
  error,
}: {
  generationId: string;
  status: ImageGenerationStatus;
  error?: string;
}) => {
  await postLatexJson(
    `/api/image-generations/${encodeURIComponent(generationId)}/status`,
    {
      status,
      ...(error ? { error } : {}),
    },
  );
};
