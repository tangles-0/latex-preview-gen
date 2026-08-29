import { mkdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { getImageGenerationApiUrl, getImageGenerationPath } from "@/lib/env";
import { formatError } from "@/lib/errors";

type Txt2ImageResponse = {
  images?: unknown;
};

const maxGeneratedImageBytes = 64 * 1024 * 1024;

export const buildTxt2ImagePayload = ({
  prompt,
  negativePrompt,
}: {
  prompt: string;
  negativePrompt?: string | null;
}) => ({
  prompt,
  negative_prompt: negativePrompt ?? "",
  width: 1024,
  height: 1024,
  steps: 8,
  cfg_scale: 1,
  sampler_name: "euler",
  seed: -1,
});

const getFirstGeneratedImage = (response: Txt2ImageResponse) => {
  if (
    !Array.isArray(response.images) ||
    typeof response.images[0] !== "string"
  ) {
    throw new Error("Image generation API returned no image.");
  }

  const encoded = response.images[0].includes(",")
    ? response.images[0].slice(response.images[0].indexOf(",") + 1)
    : response.images[0];
  const image = Buffer.from(encoded, "base64");

  if (image.length === 0) {
    throw new Error("Image generation API returned an empty image.");
  }
  if (image.length > maxGeneratedImageBytes) {
    throw new Error(
      "Image generation API returned an unexpectedly large image.",
    );
  }

  return image;
};

export const generateImage = async ({
  generationId,
  prompt,
  negativePrompt,
  timeoutMs,
}: {
  generationId: string;
  prompt: string;
  negativePrompt?: string | null;
  timeoutMs: number;
}) => {
  const url = `${getImageGenerationApiUrl()}/sdapi/v1/txt2img`;
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildTxt2ImagePayload({ prompt, negativePrompt })),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(
      `Image generation API request failed: ${formatError(error)}`,
      { cause: error },
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Image generation API returned HTTP ${response.status}${body ? `: ${body.slice(0, 1000)}` : ""}`,
    );
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > maxGeneratedImageBytes * 2
  ) {
    throw new Error("Image generation API response is unexpectedly large.");
  }

  const payload = (await response.json()) as Txt2ImageResponse;
  const image = getFirstGeneratedImage(payload);
  const outputDirectory = getImageGenerationPath();
  const outputPath = path.join(outputDirectory, `${generationId}.png`);
  await mkdir(outputDirectory, { recursive: true });
  await sharp(image).png().toFile(outputPath);

  return outputPath;
};
