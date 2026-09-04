import { and, asc, eq, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { imageGenerationJobs, type NewImageGenerationJob } from "@/db/schema";
import type {
  ImageGenerationRequest,
  ImageGenerationStatus,
} from "@/lib/imageGeneration/types";

const activeStatuses: ImageGenerationStatus[] = [
  "pending",
  "generating",
  "uploading",
];

export const createImageGenerationJob = async (
  input: ImageGenerationRequest,
) => {
  const [job] = await db
    .insert(imageGenerationJobs)
    .values({
      generationId: input.generationId,
      userId: input.userId,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt || null,
      expandPrompt: input.expandPrompt,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();

  return job;
};

export const getImageGenerationJob = async (generationId: string) => {
  const [job] = await db
    .select()
    .from(imageGenerationJobs)
    .where(eq(imageGenerationJobs.generationId, generationId))
    .limit(1);

  return job;
};

export const claimNextImageGenerationJob = async () => {
  while (true) {
    const [candidate] = await db
      .select({ generationId: imageGenerationJobs.generationId })
      .from(imageGenerationJobs)
      .where(eq(imageGenerationJobs.status, "pending"))
      .orderBy(asc(imageGenerationJobs.createdAt))
      .limit(1);

    if (!candidate) {
      return undefined;
    }

    const now = new Date();
    const [claimed] = await db
      .update(imageGenerationJobs)
      .set({
        status: "generating",
        startedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(imageGenerationJobs.generationId, candidate.generationId),
          eq(imageGenerationJobs.status, "pending"),
        ),
      )
      .returning();

    if (claimed) {
      return claimed;
    }
  }
};

export const updateImageGenerationJob = async (
  generationId: string,
  status: ImageGenerationStatus,
  fields: Partial<NewImageGenerationJob> = {},
) => {
  const [job] = await db
    .update(imageGenerationJobs)
    .set({
      ...fields,
      status,
      updatedAt: new Date(),
    })
    .where(eq(imageGenerationJobs.generationId, generationId))
    .returning();

  return job;
};

export const expireImageGenerationJob = async (
  generationId: string,
  cutoff: Date,
) => {
  const now = new Date();
  const [job] = await db
    .update(imageGenerationJobs)
    .set({
      status: "failed",
      failureReason: "Image generation exceeded the one-minute time limit.",
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(imageGenerationJobs.generationId, generationId),
        inArray(imageGenerationJobs.status, activeStatuses),
        lt(imageGenerationJobs.createdAt, cutoff),
      ),
    )
    .returning();

  return job;
};

export const listExpiredImageGenerationJobs = async (cutoff: Date) =>
  db
    .select()
    .from(imageGenerationJobs)
    .where(
      and(
        inArray(imageGenerationJobs.status, activeStatuses),
        lt(imageGenerationJobs.createdAt, cutoff),
      ),
    );

export const resetInterruptedImageGenerationJobs = async () =>
  db
    .update(imageGenerationJobs)
    .set({
      status: "pending",
      startedAt: null,
      updatedAt: new Date(),
    })
    .where(inArray(imageGenerationJobs.status, ["generating", "uploading"]));
