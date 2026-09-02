const defaultPreviewConcurrency = 2;
const maxPreviewConcurrency = 16;
const retryBaseDelayMs = 15_000;
const retryMaxDelayMs = 5 * 60_000;

export const parsePreviewConcurrency = (value: string | undefined) => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return defaultPreviewConcurrency;
  }

  const parsed = Number(normalizedValue);

  if (!Number.isInteger(parsed)) {
    return defaultPreviewConcurrency;
  }

  return Math.min(maxPreviewConcurrency, Math.max(1, parsed));
};

export const getRetryDelayMs = (completedAttempts: number) => {
  const exponent = Math.max(0, completedAttempts - 1);
  return Math.min(retryMaxDelayMs, retryBaseDelayMs * 2 ** exponent);
};

export const runWorkerPool = async <Job>({
  concurrency,
  claim,
  process,
}: {
  concurrency: number;
  claim: () => Promise<Job | undefined>;
  process: (job: Job) => Promise<void>;
}) => {
  const runWorker = async () => {
    while (true) {
      const job = await claim();

      if (job === undefined) {
        return;
      }

      await process(job);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
};
