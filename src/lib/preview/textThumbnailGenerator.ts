import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { writeJpegThumbnail } from "@/lib/preview/output";
import type { ThumbnailGenerator } from "@/lib/preview/types";

const MAX_TEXT_BYTES = 256 * 1024;
const MAX_LINES = 18;
const MAX_LINE_CHARS = 88;

const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
  "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
  "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
];

const escapeXml = (input: string) =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const resolveMonoFont = async () => {
  for (const candidate of FONT_CANDIDATES) {
    try {
      const buffer = await readFile(candidate);
      return {
        family: "PreviewMono",
        dataUri: `data:font/ttf;base64,${buffer.toString("base64")}`,
        path: candidate,
      };
    } catch {
      // try next candidate
    }
  }
  return null;
};

const labelFor = ({
  mimeType,
  sourcePath,
  ext,
}: {
  mimeType: string;
  sourcePath: string;
  ext?: string;
}) => {
  const resolvedExt = (
    ext ||
    path.extname(sourcePath).replace(/^\./, "")
  ).toLowerCase();
  if (resolvedExt) {
    return `${resolvedExt.toUpperCase()} preview`;
  }
  if (mimeType.startsWith("text/")) {
    return "TEXT preview";
  }
  return "CODE preview";
};

const renderTextPreviewPng = async ({
  sourcePath,
  mimeType,
  ext,
}: {
  sourcePath: string;
  mimeType: string;
  ext?: string;
}) => {
  const fileBuffer = await readFile(sourcePath);
  const text = fileBuffer
    .subarray(0, MAX_TEXT_BYTES)
    .toString("utf8")
    .replace(/\r/g, "")
    .replace(/[^\x09\x20-\x7E]/g, " ");

  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, MAX_LINES);
  const paddedLines = lines.length > 0 ? lines : ["(empty file)"];

  const font = await resolveMonoFont();
  const fontFamily = font
    ? "PreviewMono"
    : "DejaVu Sans Mono, Liberation Mono, monospace";
  const fontFace = font
    ? `@font-face { font-family: 'PreviewMono'; src: url('${font.dataUri}'); }`
    : "";

  const lineNodes = paddedLines
    .map(
      (line, index) =>
        `<text x="56" y="${190 + index * 30}" font-size="24" fill="#d1d5db" font-family="${fontFamily}">${escapeXml(line.slice(0, MAX_LINE_CHARS))}</text>`,
    )
    .join("");

  const label = labelFor({ mimeType, sourcePath, ext });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">
  <defs><style><![CDATA[${fontFace}]]></style></defs>
  <rect width="100%" height="100%" fill="#0f172a"/>
  <rect x="24" y="24" width="976" height="720" rx="18" fill="#111827" stroke="#1f2937"/>
  <text x="56" y="116" font-size="44" fill="#93c5fd" font-family="${fontFamily}">${escapeXml(label)}</text>
  ${lineNodes}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
};

export const textThumbnailGenerator: ThumbnailGenerator = {
  id: "text-code-preview",
  supportedContentTypes: ["text"],
  // Match any mime when contentType is "text" (host classifies by extension too).
  supportedMimeTypes: ["*"],
  generate: async ({ mediaId, sourcePath, mimeType, metadata }) => {
    const startedAt = performance.now();
    const ext =
      typeof metadata?.ext === "string" ? metadata.ext : undefined;
    const previewSource = await renderTextPreviewPng({
      sourcePath,
      mimeType,
      ext,
    });
    const thumbnailPath = await writeJpegThumbnail({
      mediaId,
      input: previewSource,
    });

    return {
      thumbnailPath,
      generationDurationMs: Math.round(performance.now() - startedAt),
    };
  },
};
