import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const formatProcessError = (error: unknown): string => {
  if (!error || typeof error !== "object") {
    return "Unknown process error.";
  }

  const maybeError = error as {
    message?: unknown;
    code?: unknown;
    stdout?: unknown;
    stderr?: unknown;
  };
  const parts: string[] = [];

  if (typeof maybeError.message === "string" && maybeError.message.trim()) {
    parts.push(maybeError.message.trim());
  }

  if (typeof maybeError.code === "string" && maybeError.code.trim()) {
    parts.push(`code=${maybeError.code}`);
  } else if (typeof maybeError.code === "number") {
    parts.push(`code=${String(maybeError.code)}`);
  }

  if (typeof maybeError.stderr === "string" && maybeError.stderr.trim()) {
    parts.push(`stderr=${maybeError.stderr.trim()}`);
  }

  if (typeof maybeError.stdout === "string" && maybeError.stdout.trim()) {
    parts.push(`stdout=${maybeError.stdout.trim()}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "Unknown process error.";
};

export const runProcess = async (
  command: string,
  args: string[],
  options: {
    timeoutMs: number;
    env?: NodeJS.ProcessEnv;
  },
) => {
  try {
    await execFileAsync(command, args, {
      timeout: options.timeoutMs,
      env: options.env,
    });
  } catch (error) {
    throw new Error(`${command} failed: ${formatProcessError(error)}`, {
      cause: error,
    });
  }
};
