import { assertThumbnailGenerator } from "@/lib/preview/generatorRegistry";
import type {
  ThumbnailGeneratorInput,
  ThumbnailGeneratorResult,
} from "@/lib/preview/types";

export const generateThumbnail = async (
  input: ThumbnailGeneratorInput,
): Promise<ThumbnailGeneratorResult> => {
  const generator = assertThumbnailGenerator(input);
  return generator.generate(input);
};
