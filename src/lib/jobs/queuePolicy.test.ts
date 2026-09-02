import { describe, expect, it } from "vitest";

import {
  getRetryDelayMs,
  parsePreviewConcurrency,
  runWorkerPool,
} from "@/lib/jobs/queuePolicy";

describe("parsePreviewConcurrency", () => {
  it.each([
    [undefined, 2],
    ["", 2],
    ["nope", 2],
    ["1.5", 2],
    ["0", 1],
    ["1", 1],
    ["4", 4],
    ["999", 16],
  ])("parses %s as %i", (input, expected) => {
    expect(parsePreviewConcurrency(input)).toBe(expected);
  });
});

describe("getRetryDelayMs", () => {
  it("uses bounded exponential backoff", () => {
    expect(getRetryDelayMs(1)).toBe(15_000);
    expect(getRetryDelayMs(2)).toBe(30_000);
    expect(getRetryDelayMs(3)).toBe(60_000);
    expect(getRetryDelayMs(20)).toBe(300_000);
  });
});

describe("runWorkerPool", () => {
  it("never processes more than the configured concurrency", async () => {
    const jobs = Array.from({ length: 12 }, (_, index) => index);
    let active = 0;
    let maximumActive = 0;

    await runWorkerPool({
      concurrency: 3,
      claim: () => Promise.resolve(jobs.shift()),
      process: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
      },
    });

    expect(maximumActive).toBe(3);
    expect(active).toBe(0);
    expect(jobs).toHaveLength(0);
  });
});
