import { describe, expect, it } from "vitest";

import { buildTxt2ImagePayload } from "@/lib/imageGeneration/generator";
import {
  getRemainingImageGenerationTimeMs,
  isImageGenerationExpired,
} from "@/lib/imageGeneration/policy";
import { imageGenerationRequestSchema } from "@/lib/imageGeneration/types";

describe("image generation policy", () => {
  it("builds the fixed txt2img payload", () => {
    expect(
      buildTxt2ImagePayload({
        prompt: "a city",
        negativePrompt: "blurry",
      }),
    ).toEqual({
      prompt: "a city",
      negative_prompt: "blurry",
      width: 1024,
      height: 1024,
      steps: 8,
      cfg_scale: 1,
      sampler_name: "euler",
      seed: -1,
    });
  });

  it("expires requests after one minute", () => {
    const createdAt = new Date("2026-08-29T00:00:00.000Z");
    const almostExpired = createdAt.getTime() + 59_999;
    const expired = createdAt.getTime() + 60_000;

    expect(getRemainingImageGenerationTimeMs(createdAt, almostExpired)).toBe(1);
    expect(isImageGenerationExpired(createdAt, almostExpired)).toBe(false);
    expect(isImageGenerationExpired(createdAt, expired)).toBe(true);
  });

  it("requires a valid id, user, and prompt", () => {
    expect(
      imageGenerationRequestSchema.safeParse({
        generationId: "not-a-uuid",
        userId: "",
        prompt: "",
      }).success,
    ).toBe(false);
  });
});
