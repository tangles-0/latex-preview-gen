import { uploadFileToLatex } from "@/lib/latex/multipartUpload";

export const uploadGeneratedImageToLatex = async ({
  generationId,
  userId,
  prompt,
  filePath,
}: {
  generationId: string;
  userId: string;
  prompt: string;
  filePath: string;
}) => {
  const safePrompt = prompt
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return uploadFileToLatex({
    userId,
    fileName: `${safePrompt || `generated-${generationId}`}.png`,
    filePath,
    mimeType: "image/png",
    targetType: "image",
    completePayload: {
      imageGenerationId: generationId,
    },
    onProgress: async () => {},
  });
};
