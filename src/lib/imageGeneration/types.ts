import { z } from "zod";

export const imageGenerationRequestSchema = z.object({
  generationId: z.string().uuid(),
  userId: z.string().min(1).max(255),
  prompt: z.string().trim().min(1).max(2000),
  negativePrompt: z.string().trim().max(2000).optional(),
});

export type ImageGenerationStatus =
  | "pending"
  | "generating"
  | "uploading"
  | "complete"
  | "failed";

export type ImageGenerationRequest = z.infer<
  typeof imageGenerationRequestSchema
>;
