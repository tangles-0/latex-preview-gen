import { dummyThumbnailGenerator } from "@/lib/preview/dummyThumbnailGenerator";
import type { ThumbnailGenerator } from "@/lib/preview/types";

const thumbnailGenerators: readonly ThumbnailGenerator[] = [
  dummyThumbnailGenerator,
];

const normalize = (value: string) => value.trim().toLowerCase();

export class UnsupportedMediaTypeError extends Error {
  contentType: string;
  mimeType: string;

  constructor(contentType: string, mimeType: string) {
    super(
      `Unsupported media type: contentType "${contentType}", mimeType "${mimeType}"`,
    );
    this.name = "UnsupportedMediaTypeError";
    this.contentType = contentType;
    this.mimeType = mimeType;
  }
}

export const getThumbnailGenerator = ({
  contentType,
  mimeType,
}: {
  contentType: string;
  mimeType: string;
}) => {
  const normalizedContentType = normalize(contentType);
  const normalizedMimeType = normalize(mimeType);

  return thumbnailGenerators.find(
    (generator) =>
      generator.supportedContentTypes
        .map((supportedContentType) => normalize(supportedContentType))
        .includes(normalizedContentType) &&
      generator.supportedMimeTypes
        .map((supportedMimeType) => normalize(supportedMimeType))
        .includes(normalizedMimeType),
  );
};

export const assertThumbnailGenerator = ({
  contentType,
  mimeType,
}: {
  contentType: string;
  mimeType: string;
}) => {
  const generator = getThumbnailGenerator({ contentType, mimeType });

  if (!generator) {
    throw new UnsupportedMediaTypeError(contentType, mimeType);
  }

  return generator;
};

export const getSupportedThumbnailTypes = () =>
  thumbnailGenerators.map((generator) => ({
    id: generator.id,
    contentTypes: [...generator.supportedContentTypes],
    mimeTypes: [...generator.supportedMimeTypes],
  }));
