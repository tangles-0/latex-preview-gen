import { execFile } from "node:child_process";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { ytdlpUpdateChecks } from "@/db/schema";
import {
  getYtdlpReleaseBinary,
  getYtdlpReleaseBinaryName,
} from "@/lib/env";
import { formatError } from "@/lib/errors";

const execFileAsync = promisify(execFile);
const checkIntervalMs = 12 * 60 * 60 * 1000;
const latestReleaseApiUrl =
  "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";

type GithubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GithubRelease = {
  tag_name: string;
  html_url: string;
  assets: GithubReleaseAsset[];
};

const normalizeVersion = (version: string | null | undefined) =>
  version?.trim().replace(/^v/, "") ?? "";

const compareVersions = (left: string | null | undefined, right: string) => {
  const leftParts = normalizeVersion(left).split(".").map(Number);
  const rightParts = normalizeVersion(right).split(".").map(Number);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightPart = Number.isFinite(rightParts[index])
      ? rightParts[index]
      : 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
};

const getLocalVersion = async (binaryPath: string) => {
  try {
    const { stdout } = await execFileAsync(binaryPath, ["--version"], {
      timeout: 10_000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
};

const getLatestRelease = async () => {
  const response = await fetch(latestReleaseApiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "latex-preview-gen",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub release check failed with HTTP ${response.status}`);
  }

  return (await response.json()) as GithubRelease;
};

const downloadBinary = async ({
  binaryPath,
  assetUrl,
}: {
  binaryPath: string;
  assetUrl: string;
}) => {
  const response = await fetch(assetUrl, {
    headers: {
      "User-Agent": "latex-preview-gen",
    },
  });

  if (!response.ok) {
    throw new Error(`yt-dlp download failed with HTTP ${response.status}`);
  }

  await mkdir(path.dirname(binaryPath), { recursive: true });
  const tempPath = `${binaryPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, Buffer.from(await response.arrayBuffer()));
  await chmod(tempPath, 0o755);
  await rename(tempPath, binaryPath);
};

const upsertCheck = async ({
  binaryName,
  binaryPath,
  localVersion,
  latestVersion,
  releaseUrl,
  assetUrl,
  lastUpdatedAt,
  lastError,
}: {
  binaryName: string;
  binaryPath: string;
  localVersion: string | null;
  latestVersion: string | null;
  releaseUrl: string | null;
  assetUrl: string | null;
  lastUpdatedAt?: Date;
  lastError?: string | null;
}) => {
  const now = new Date();

  await db
    .insert(ytdlpUpdateChecks)
    .values({
      binaryName,
      binaryPath,
      localVersion,
      latestVersion,
      releaseUrl,
      assetUrl,
      lastCheckedAt: now,
      lastUpdatedAt,
      lastError: lastError ?? null,
    })
    .onConflictDoUpdate({
      target: ytdlpUpdateChecks.binaryName,
      set: {
        binaryPath,
        localVersion,
        latestVersion,
        releaseUrl,
        assetUrl,
        lastCheckedAt: now,
        ...(lastUpdatedAt ? { lastUpdatedAt } : {}),
        lastError: lastError ?? null,
        updatedAt: now,
      },
    });
};

export const ensureYtdlpBinaryCurrent = async () => {
  const binaryName = getYtdlpReleaseBinaryName();
  const binaryPath = getYtdlpReleaseBinary();
  const [existingCheck] = await db
    .select()
    .from(ytdlpUpdateChecks)
    .where(eq(ytdlpUpdateChecks.binaryName, binaryName))
    .limit(1);

  if (
    existingCheck?.lastCheckedAt &&
    Date.now() - existingCheck.lastCheckedAt.getTime() < checkIntervalMs
  ) {
    return;
  }

  let localVersion = await getLocalVersion(binaryPath);

  try {
    const release = await getLatestRelease();
    const latestVersion = normalizeVersion(release.tag_name);
    const asset = release.assets.find((item) => item.name === binaryName);

    if (!asset) {
      throw new Error(
        `Latest yt-dlp release does not include asset "${binaryName}".`,
      );
    }

    let lastUpdatedAt: Date | undefined;

    if (!localVersion || compareVersions(localVersion, latestVersion) < 0) {
      await downloadBinary({
        binaryPath,
        assetUrl: asset.browser_download_url,
      });
      localVersion = await getLocalVersion(binaryPath);
      lastUpdatedAt = new Date();
    }

    await upsertCheck({
      binaryName,
      binaryPath,
      localVersion,
      latestVersion,
      releaseUrl: release.html_url,
      assetUrl: asset.browser_download_url,
      lastUpdatedAt,
    });
  } catch (error) {
    await upsertCheck({
      binaryName,
      binaryPath,
      localVersion,
      latestVersion: existingCheck?.latestVersion ?? null,
      releaseUrl: existingCheck?.releaseUrl ?? null,
      assetUrl: existingCheck?.assetUrl ?? null,
      lastError: formatError(error),
    });
  }
};
