import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isAuthorizedIncomingRequest } from "@/lib/auth";
import { processYoutubeIngest } from "@/lib/youtube/processor";
import {
  createOrResetYoutubeIngest,
  getYoutubeVideo,
} from "@/lib/youtube/repository";
import { youtubeDownloadRequestSchema } from "@/lib/youtube/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  if (!isAuthorizedIncomingRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = youtubeDownloadRequestSchema.parse(await request.json());
    const video = await getYoutubeVideo(payload.youtubeId);

    if (!video) {
      return NextResponse.json(
        { error: "Could not start download" },
        { status: 404 },
      );
    }

    const quality = video.qualities.find(
      (item) => item.id === payload.qualityId,
    );

    if (!quality) {
      return NextResponse.json(
        { error: "Could not start download" },
        { status: 400 },
      );
    }

    await createOrResetYoutubeIngest(payload);
    void processYoutubeIngest(payload);

    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.issues },
        { status: 400 },
      );
    }

    console.error("Could not start YouTube download", error);
    return NextResponse.json(
      { error: "Could not start download" },
      { status: 500 },
    );
  }
};
