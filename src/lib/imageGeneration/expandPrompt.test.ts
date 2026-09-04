import { afterEach, describe, expect, it, vi } from "vitest";

import {
  expandImagePrompt,
  imagePromptExpandSystemPrompt,
  liteLlmChatCompletionsUrl,
  sanitizeExpandedImagePrompt,
} from "@/lib/imageGeneration/expandPrompt";

describe("image prompt expansion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("builds the OpenAI-compatible chat completions URL", () => {
    expect(liteLlmChatCompletionsUrl("http://ubuntu-server:4000")).toBe(
      "http://ubuntu-server:4000/v1/chat/completions",
    );
    expect(liteLlmChatCompletionsUrl("http://ubuntu-server:4000/v1")).toBe(
      "http://ubuntu-server:4000/v1/chat/completions",
    );
    expect(
      liteLlmChatCompletionsUrl(
        "http://ubuntu-server:4000/v1/chat/completions",
      ),
    ).toBe("http://ubuntu-server:4000/v1/chat/completions");
  });

  it("strips fences and quotes from the expanded prompt", () => {
    expect(
      sanitizeExpandedImagePrompt(
        '```text\n"cinematic photo of a city, sharp focus"\n```',
        "a city",
      ),
    ).toBe("cinematic photo of a city, sharp focus");
  });

  it("falls back to the original prompt when the model returns empty text", () => {
    expect(sanitizeExpandedImagePrompt("   ", "a city")).toBe("a city");
  });

  it("asks LiteLLM to expand the prompt with the image system prompt", async () => {
    vi.stubEnv("LITE_LLM_API_URL", "http://ubuntu-server:4000");
    vi.stubEnv("LITE_LLM_API_KEY", "test-key");
    vi.stubEnv("LITE_LLM_MODEL", "minty-main");

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "cinematic photograph of a futuristic city, golden hour, sharp focus",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      expandImagePrompt({ prompt: "a futuristic city", timeoutMs: 5_000 }),
    ).resolves.toBe(
      "cinematic photograph of a futuristic city, golden hour, sharp focus",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://ubuntu-server:4000/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "minty-main",
          temperature: 0.6,
          max_tokens: 800,
          messages: [
            { role: "system", content: imagePromptExpandSystemPrompt },
            { role: "user", content: "a futuristic city" },
          ],
        }),
      }),
    );
  });

  it("fails when LiteLLM is not configured", async () => {
    vi.stubEnv("LITE_LLM_API_URL", "");
    vi.stubEnv("LITE_LLM_API_KEY", "");
    vi.stubEnv("LITE_LLM_MODEL", "");

    await expect(
      expandImagePrompt({ prompt: "a city", timeoutMs: 5_000 }),
    ).rejects.toThrow("LiteLLM is not configured");
  });
});
