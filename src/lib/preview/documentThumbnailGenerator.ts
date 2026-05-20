import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { writeJpegThumbnail } from "@/lib/preview/output";
import { getExtensionForFile } from "@/lib/preview/paths";
import { runProcess } from "@/lib/preview/process";
import { createWorkingDir, removeWorkingDir } from "@/lib/preview/temp";
import type { ThumbnailGenerator } from "@/lib/preview/types";

const officeMimeTypes = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
] as const;

const renderPdfFirstPage = async (pdfPath: string) => {
  const tempDirectory = await createWorkingDir("latex-pdf-preview-");
  const outputPrefix = path.join(tempDirectory, "preview");
  const outputPath = `${outputPrefix}.png`;

  try {
    await runProcess(
      "pdftoppm",
      ["-f", "1", "-singlefile", "-png", pdfPath, outputPrefix],
      { timeoutMs: 20_000 },
    );

    return await readFile(outputPath);
  } finally {
    await removeWorkingDir(tempDirectory);
  }
};

const renderOfficeDocumentFirstPage = async ({
  sourcePath,
  mimeType,
}: {
  sourcePath: string;
  mimeType: string;
}) => {
  const tempDirectory = await createWorkingDir("latex-office-preview-");
  const extension =
    getExtensionForFile({ mimeType }) || path.extname(sourcePath) || ".bin";
  const inputPath = path.join(tempDirectory, `input${extension}`);
  const pdfPath = path.join(tempDirectory, "input.pdf");
  const outputPrefix = path.join(tempDirectory, "preview");
  const outputPath = `${outputPrefix}.png`;
  const officeProfilePath = path.join(tempDirectory, "lo-profile");
  const officeProfileUri = `file://${officeProfilePath}`;

  try {
    await mkdir(officeProfilePath, { recursive: true });
    await copyFile(sourcePath, inputPath);
    await runProcess(
      "soffice",
      [
        "--headless",
        "--invisible",
        "--nologo",
        "--nodefault",
        "--nolockcheck",
        "--norestore",
        `-env:UserInstallation=${officeProfileUri}`,
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        tempDirectory,
        inputPath,
      ],
      {
        timeoutMs: 30_000,
        env: {
          ...process.env,
          HOME: tempDirectory,
          TMPDIR: tempDirectory,
        },
      },
    );

    await runProcess(
      "pdftoppm",
      ["-f", "1", "-singlefile", "-png", pdfPath, outputPrefix],
      { timeoutMs: 20_000 },
    );

    return await readFile(outputPath);
  } finally {
    await removeWorkingDir(tempDirectory);
  }
};

export const documentThumbnailGenerator: ThumbnailGenerator = {
  id: "document-system-tools",
  supportedContentTypes: ["document", "doc"],
  supportedMimeTypes: ["application/pdf", ...officeMimeTypes],
  generate: async ({ mediaId, sourcePath, mimeType }) => {
    const startedAt = performance.now();
    const normalizedMimeType = mimeType.toLowerCase();
    const previewSource =
      normalizedMimeType === "application/pdf"
        ? await renderPdfFirstPage(sourcePath)
        : await renderOfficeDocumentFirstPage({ sourcePath, mimeType });
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
