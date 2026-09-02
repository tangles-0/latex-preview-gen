export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { isImageGenerationEnabled } = await import("@/lib/env");
  const { startThumbnailQueue } = await import("@/lib/jobs/processor");
  void startThumbnailQueue();
  if (isImageGenerationEnabled()) {
    const { dispatchImageGenerationQueue } =
      await import("@/lib/imageGeneration/processor");
    void dispatchImageGenerationQueue();
  }
}
