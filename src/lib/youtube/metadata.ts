import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

import { getYtdlpBinary } from "@/lib/env";
import { formatError } from "@/lib/errors";
import { getExtensionForFile } from "@/lib/preview/paths";
import { getYtdlpBaseArgs } from "@/lib/youtube/ytdlpArgs";
import { getYoutubeThumbnailFilePath } from "@/lib/youtube/paths";
import type { YoutubeMetadata, YoutubeQuality } from "@/lib/youtube/types";

type YtdlpFormat = {
  format_id?: string;
  ext?: string;
  height?: number;
  fps?: number;
  filesize?: number;
  filesize_approx?: number;
  vcodec?: string;
  acodec?: string;
};

type YtdlpMetadata = {
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  webpage_url?: string;
  original_url?: string;
  formats?: YtdlpFormat[];
  thumbnails?: Array<{
    url?: string;
    preference?: number;
    width?: number;
    height?: number;
  }>;
};

const bufferFromChunk = (chunk: unknown) => {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }

  if (chunk instanceof ArrayBuffer) {
    return Buffer.from(chunk);
  }

  return Buffer.from(String(chunk));
};

const runYtdlpJson = (url: string) =>
  new Promise<YtdlpMetadata>((resolve, reject) => {
    const child = spawn(
      getYtdlpBinary(),
      [...getYtdlpBaseArgs(), "--dump-single-json", "--no-playlist", url],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: unknown) => {
      const buffer = bufferFromChunk(chunk);
      stdout.push(buffer);
      const text = buffer.toString("utf8").trim();

      if (text) {
        console.info("[yt-dlp metadata stdout]", text);
      }
    });
    child.stderr.on("data", (chunk: unknown) => {
      const buffer = bufferFromChunk(chunk);
      stderr.push(buffer);
      const text = buffer.toString("utf8").trim();

      if (text) {
        console.warn("[yt-dlp metadata stderr]", text);
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `yt-dlp exited with code ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
          ),
        );
        return;
      }

      try {
        resolve(
          JSON.parse(Buffer.concat(stdout).toString("utf8")) as YtdlpMetadata,
        );
      } catch (error) {
        reject(
          new Error(`Could not parse yt-dlp metadata: ${formatError(error)}`),
        );
      }
    });
  });

const isVideoOnly = (format: YtdlpFormat) =>
  Boolean(format.format_id) &&
  format.vcodec !== "none" &&
  format.acodec === "none";

const isProgressiveVideo = (format: YtdlpFormat) =>
  Boolean(format.format_id) &&
  format.vcodec !== "none" &&
  format.acodec !== "none";

const isAudioOnly = (format: YtdlpFormat) =>
  Boolean(format.format_id) &&
  format.vcodec === "none" &&
  format.acodec !== "none";

const getFormatSize = (format: YtdlpFormat) =>
  format.filesize ?? format.filesize_approx ?? null;

const getBestAudioFormat = (formats: YtdlpFormat[]) => {
  const mp4Audio = formats.filter(
    (format) =>
      isAudioOnly(format) && (format.ext === "m4a" || format.ext === "mp4"),
  );
  return mp4Audio[mp4Audio.length - 1] ?? formats.find(isAudioOnly);
};

const qualityLabel = ({
  height,
  fps,
  ext,
}: {
  height: number | null;
  fps: number | null;
  ext: string;
}) => {
  const resolution = height ? `${height}p` : "unknown";
  const frameRate = fps && fps > 30 ? `${fps}fps ` : "";
  return `${resolution} ${frameRate}${ext}`.trim();
};

const buildQualities = (formats: YtdlpFormat[]): YoutubeQuality[] => {
  const bestAudio = getBestAudioFormat(formats);
  const qualities = new Map<string, YoutubeQuality>();

  for (const format of formats.filter(isProgressiveVideo)) {
    if (!format.format_id) {
      continue;
    }

    const height = format.height ?? null;
    const fps = format.fps ?? null;
    const ext = format.ext ?? "mp4";
    qualities.set(format.format_id, {
      id: format.format_id,
      label: qualityLabel({ height, fps, ext }),
      height,
      fps,
      ext,
      filesizeBytes: getFormatSize(format),
    });
  }

  for (const format of formats.filter(isVideoOnly)) {
    if (!format.format_id || !bestAudio?.format_id) {
      continue;
    }

    const height = format.height ?? null;
    const fps = format.fps ?? null;
    const ext = format.ext === "webm" ? "webm" : "mp4";
    const videoSize = getFormatSize(format);
    const audioSize = getFormatSize(bestAudio);
    qualities.set(`${format.format_id}+${bestAudio.format_id}`, {
      id: `${format.format_id}+${bestAudio.format_id}`,
      label: qualityLabel({ height, fps, ext }),
      height,
      fps,
      ext,
      filesizeBytes:
        videoSize !== null && audioSize !== null
          ? videoSize + audioSize
          : (videoSize ?? null),
    });
  }

  return [...qualities.values()]
    .filter((quality) => quality.height !== null)
    .sort(
      (left, right) =>
        (right.height ?? 0) - (left.height ?? 0) ||
        (right.fps ?? 0) - (left.fps ?? 0),
    );
};

const selectThumbnailUrl = (metadata: YtdlpMetadata) => {
  const thumbnails = [...(metadata.thumbnails ?? [])]
    .filter((thumbnail) => Boolean(thumbnail.url))
    .sort(
      (left, right) =>
        (right.preference ?? 0) - (left.preference ?? 0) ||
        (right.width ?? 0) - (left.width ?? 0),
    );

  return thumbnails[0]?.url ?? metadata.thumbnail;
};

const saveYoutubeThumbnail = async (
  youtubeId: string,
  thumbnailUrl: string | undefined,
) => {
  if (!thumbnailUrl) {
    return undefined;
  }

  const response = await fetch(thumbnailUrl);

  if (!response.ok) {
    return undefined;
  }

  const mimeType = response.headers.get("content-type") ?? "image/jpeg";
  const extension = getExtensionForFile({ mimeType }) || ".jpg";
  const thumbnailPath = await getYoutubeThumbnailFilePath(youtubeId, extension);
  await writeFile(thumbnailPath, Buffer.from(await response.arrayBuffer()));
  return thumbnailPath;
};

export const fetchYoutubeMetadata = async (
  url: string,
): Promise<YoutubeMetadata> => {
  const metadata = await runYtdlpJson(url);
  const youtubeId = metadata.id;

  if (!youtubeId) {
    throw new Error("yt-dlp did not return a YouTube id.");
  }

  const thumbnailUrl = selectThumbnailUrl(metadata);
  const thumbnailPath = await saveYoutubeThumbnail(youtubeId, thumbnailUrl);

  return {
    youtubeId,
    title: metadata.title ?? "Untitled YouTube video",
    channelName: metadata.channel ?? metadata.uploader ?? "Unknown channel",
    durationSeconds: Math.round(metadata.duration ?? 0),
    qualities: buildQualities(metadata.formats ?? []),
    thumbnailUrl,
    thumbnailPath,
    rawMetadata: {
      ...metadata,
      original_url: metadata.original_url ?? url,
    },
  };
};
