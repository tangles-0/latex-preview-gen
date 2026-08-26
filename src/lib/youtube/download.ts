import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { getYoutubeDownloadPath, getYtdlpBinary } from "@/lib/env";
import { formatError } from "@/lib/errors";
import { getYoutubeDownloadOutputTemplate } from "@/lib/youtube/paths";
import { getYtdlpBaseArgs } from "@/lib/youtube/ytdlpArgs";
import type { YoutubeOutputType } from "@/lib/youtube/types";

const parseProgress = (line: string) => {
  const match = line.match(/download:\s*(\d+(?:\.\d+)?)%/);
  return match ? Math.round(Number(match[1])) : null;
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

const findDownloadedFile = async (ingestId: string) => {
  const directory = getYoutubeDownloadPath();
  const files = await readdir(directory);
  const prefix = ingestId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const candidates = await Promise.all(
    files
      .filter((file) => file.startsWith(prefix) && !file.endsWith(".part"))
      .map(async (file) => {
        const filePath = path.join(directory, file);
        return {
          filePath,
          stats: await stat(filePath),
        };
      }),
  );

  return candidates.sort(
    (left, right) => right.stats.mtimeMs - left.stats.mtimeMs,
  )[0]?.filePath;
};

export const mimeTypeForYoutubeOutput = (
  filePath: string,
  outputType: YoutubeOutputType,
) => {
  if (outputType === "audio") {
    return "audio/mpeg";
  }

  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".webm") {
    return "video/webm";
  }

  if (extension === ".mov") {
    return "video/quicktime";
  }

  return "video/mp4";
};

export const downloadYoutubeMedia = async ({
  ingestId,
  url,
  qualityId,
  outputType,
  onProgress,
}: {
  ingestId: string;
  url: string;
  qualityId?: string;
  outputType: YoutubeOutputType;
  onProgress: (progress: number) => Promise<void>;
}) =>
  new Promise<string>((resolve, reject) => {
    void getYoutubeDownloadOutputTemplate(ingestId)
      .then((outputTemplate) => {
        const binary = getYtdlpBinary();
        const formatArgs =
          outputType === "audio"
            ? [
                "-f",
                "bestaudio/best",
                "--extract-audio",
                "--audio-format",
                "mp3",
                "--audio-quality",
                "0",
              ]
            : ["-f", qualityId ?? "", "--merge-output-format", "mp4"];
        const args = [
          ...getYtdlpBaseArgs(),
          "--no-playlist",
          "--newline",
          "--progress-template",
          "download:%(progress._percent_str)s",
          "--print",
          "after_move:filepath",
          ...formatArgs,
          "-o",
          outputTemplate,
          url,
        ];
        const child = spawn(binary, args, {
          stdio: ["ignore", "pipe", "pipe"],
        });
        const stderr: Buffer[] = [];
        const outputPaths: string[] = [];
        let pendingProgress = Promise.resolve();

        child.stdout.on("data", (chunk: unknown) => {
          const text = bufferFromChunk(chunk).toString("utf8");
          const trimmedOutput = text.trim();

          if (trimmedOutput) {
            console.info("[yt-dlp download stdout]", trimmedOutput);
          }

          for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();

            if (!trimmed) {
              continue;
            }

            const progress = parseProgress(trimmed);

            if (progress !== null) {
              pendingProgress = pendingProgress.then(() =>
                onProgress(Math.min(99, progress)),
              );
            } else if (path.isAbsolute(trimmed)) {
              outputPaths.push(trimmed);
            }
          }
        });
        child.stderr.on("data", (chunk: unknown) => {
          const buffer = bufferFromChunk(chunk);
          stderr.push(buffer);
          const text = buffer.toString("utf8").trim();

          if (text) {
            console.warn("[yt-dlp download stderr]", text);
          }
        });
        child.on("error", reject);
        child.on("close", (code) => {
          void pendingProgress
            .then(async () => {
              if (code !== 0) {
                reject(
                  new Error(
                    `yt-dlp failed with code ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
                  ),
                );
                return;
              }

              resolve(
                outputPaths.at(-1) ??
                  (await findDownloadedFile(ingestId)) ??
                  "",
              );
            })
            .catch(reject);
        });
      })
      .catch((error) =>
        reject(
          new Error(
            `Could not prepare YouTube download: ${formatError(error)}`,
          ),
        ),
      );
  }).then((filePath) => {
    if (!filePath) {
      throw new Error("yt-dlp did not produce a downloaded file path.");
    }

    return filePath;
  });
