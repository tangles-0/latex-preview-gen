export type ThumbnailGeneratorInput = {
  mediaId: string;
  sourcePath: string;
  contentType: string;
  mimeType: string;
  metadata?: Record<string, unknown> | null;
};

export type ThumbnailGeneratorResult = {
  thumbnailPath: string;
  generationDurationMs: number;
};

export type ThumbnailGenerator = {
  id: string;
  supportedContentTypes: readonly string[];
  supportedMimeTypes: readonly string[];
  generate: (
    input: ThumbnailGeneratorInput,
  ) => Promise<ThumbnailGeneratorResult>;
};
