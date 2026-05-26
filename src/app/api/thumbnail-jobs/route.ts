import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isAuthorizedIncomingRequest } from "@/lib/auth";
import { createOrResetPendingJob } from "@/lib/jobs/repository";
import { processGenerationJob } from "@/lib/jobs/processor";
import { thumbnailJobPayloadSchema } from "@/lib/jobs/types";
import {
  getSupportedThumbnailTypes,
  getThumbnailGenerator,
} from "@/lib/preview/generatorRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  if (!isAuthorizedIncomingRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = thumbnailJobPayloadSchema.parse(await request.json());

    if (!getThumbnailGenerator(payload)) {
      console.error("Unsupported media type", payload);
      return NextResponse.json(
        {
          error: "Unsupported media type",
          contentType: payload.contentType,
          mimeType: payload.mimeType,
          supported: getSupportedThumbnailTypes(),
        },
        { status: 415 },
      );
    }

    const { job, shouldProcess } = await createOrResetPendingJob(payload);

    if (shouldProcess) {
      void processGenerationJob(job.mediaId);
    }

    return NextResponse.json(
      {
        mediaId: job.mediaId,
        status: job.status,
        ignored: !shouldProcess,
      },
      { status: shouldProcess ? 202 : 200 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
};
