import { NextResponse } from "next/server";

import { isAuthorizedIncomingRequest } from "@/lib/auth";
import { isImageGenerationEnabled } from "@/lib/env";
import { imageGenerationMaxAgeMs } from "@/lib/imageGeneration/policy";
import {
  expireImageGenerationJob,
  getImageGenerationJob,
} from "@/lib/imageGeneration/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ generationId: string }> },
) => {
  if (!isImageGenerationEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isAuthorizedIncomingRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { generationId } = await params;
  const job = await getImageGenerationJob(generationId);

  if (!job) {
    return NextResponse.json(
      { error: "Image generation not found" },
      { status: 404 },
    );
  }

  const expired =
    job.status === "complete" || job.status === "failed"
      ? undefined
      : await expireImageGenerationJob(
          generationId,
          new Date(Date.now() - imageGenerationMaxAgeMs),
        );
  const current = expired ?? job;

  return NextResponse.json({
    generationId: current.generationId,
    status: current.status,
    error: current.failureReason,
    mediaId: current.uploadedMediaId,
    createdAt: current.createdAt.toISOString(),
    updatedAt: current.updatedAt.toISOString(),
  });
};
