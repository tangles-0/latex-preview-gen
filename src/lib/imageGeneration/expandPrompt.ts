import {
  getLiteLlmApiKey,
  getLiteLlmApiUrl,
  getLiteLlmModel,
  isLiteLlmConfigured,
} from "@/lib/env";
import { formatError } from "@/lib/errors";

export const expandedImagePromptMaxLength = 4000;

export const imagePromptExpandSystemPrompt = `You expand a user's text into a stronger prompt for a text-to-image model.

Rules:
- Preserve the user's subject, intent, style, and any explicit constraints.
- Add typical image-prompt keywords only when they improve the result, such as medium (photograph, illustration, 3D render), lighting, composition, camera or lens, materials, color, atmosphere, and quality tags (sharp focus, highly detailed, and similar).
- Do not invent a different subject or contradict the user.
- Do not add artist names, celebrity names, or copyrighted franchise names unless the user already included them.
- Return only the expanded prompt as plain text. No quotes, labels, markdown, or commentary.
- Keep the expanded prompt under ${expandedImagePromptMaxLength} characters.`;

export const liteLlmChatCompletionsUrl = (baseUrl: string) => {
  const base = baseUrl.replace(/\/$/, "");
  if (base.endsWith("/chat/completions")) {
    return base;
  }
  if (base.endsWith("/v1")) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
};

export const sanitizeExpandedImagePrompt = (raw: string, original: string) => {
  let prompt = raw.trim();
  const fenced = prompt.match(/^```(?:[\w-]+)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1]) {
    prompt = fenced[1].trim();
  }
  if (
    (prompt.startsWith('"') && prompt.endsWith('"')) ||
    (prompt.startsWith("'") && prompt.endsWith("'"))
  ) {
    prompt = prompt.slice(1, -1).trim();
  }
  prompt = prompt.replace(/\s+/g, " ").trim();
  if (prompt.length > expandedImagePromptMaxLength) {
    prompt = prompt.slice(0, expandedImagePromptMaxLength).trim();
  }
  return prompt || original;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const contentFromResponse = (payload: ChatCompletionResponse) => {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("LiteLLM returned no expanded prompt.");
  }
  return content;
};

export const expandImagePrompt = async ({
  prompt,
  timeoutMs,
}: {
  prompt: string;
  timeoutMs: number;
}) => {
  if (!isLiteLlmConfigured()) {
    throw new Error(
      "Prompt expansion is unavailable because LiteLLM is not configured.",
    );
  }

  const url = liteLlmChatCompletionsUrl(getLiteLlmApiUrl());
  const apiKey = getLiteLlmApiKey();
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: getLiteLlmModel(),
        temperature: 0.6,
        max_tokens: 800,
        messages: [
          { role: "system", content: imagePromptExpandSystemPrompt },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`LiteLLM prompt expansion failed: ${formatError(error)}`, {
      cause: error,
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `LiteLLM returned HTTP ${response.status}${
        body ? `: ${body.slice(0, 1000)}` : ""
      }`,
    );
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  return sanitizeExpandedImagePrompt(contentFromResponse(payload), prompt);
};
