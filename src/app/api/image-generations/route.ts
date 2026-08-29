import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isAuthorizedIncomingRequest } from "@/lib/auth";
import { dispatchImageGenerationQueue } from "@/lib/imageGeneration/processor";
import {
  createImageGenerationJob,
  getImageGenerationJob,
} from "@/lib/imageGeneration/repository";
import { imageGenerationRequestSchema } from "@/lib/imageGeneration/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  if (!isAuthorizedIncomingRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = imageGenerationRequestSchema.parse(await request.json());
    const created = await createImageGenerationJob(payload);
    const job = created ?? (await getImageGenerationJob(payload.generationId));

    if (job?.status === "pending") {
      void dispatchImageGenerationQueue();
    }

    return NextResponse.json(
      {
        generationId: payload.generationId,
        status: job?.status ?? "pending",
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.issues },
        { status: 400 },
      );
    }

    console.error("Could not queue image generation", error);
    return NextResponse.json(
      { error: "Could not queue image generation" },
      { status: 500 },
    );
  }
};
