export const imageGenerationMaxAgeMs = 60_000;

export const getRemainingImageGenerationTimeMs = (
  createdAt: Date,
  now = Date.now(),
) => imageGenerationMaxAgeMs - (now - createdAt.getTime());

export const isImageGenerationExpired = (createdAt: Date, now = Date.now()) =>
  getRemainingImageGenerationTimeMs(createdAt, now) <= 0;
