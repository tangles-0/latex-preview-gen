export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { retryStartupJobs } = await import("@/lib/jobs/processor");
  const { dispatchImageGenerationQueue } =
    await import("@/lib/imageGeneration/processor");
  void retryStartupJobs();
  void dispatchImageGenerationQueue();
}
