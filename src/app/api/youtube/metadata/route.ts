import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isAuthorizedIncomingRequest } from "@/lib/auth";
import { fetchYoutubeMetadata } from "@/lib/youtube/metadata";
import { upsertYoutubeVideo } from "@/lib/youtube/repository";
import { youtubeMetadataRequestSchema } from "@/lib/youtube/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  if (!isAuthorizedIncomingRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = youtubeMetadataRequestSchema.parse(await request.json());
    const metadata = await fetchYoutubeMetadata(payload.url);
    await upsertYoutubeVideo(metadata);

    return NextResponse.json({
      youtubeId: metadata.youtubeId,
      title: metadata.title,
      channelName: metadata.channelName,
      durationSeconds: metadata.durationSeconds,
      qualities: metadata.qualities,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.issues },
        { status: 400 },
      );
    }

    console.error("Could not fetch YouTube metadata", error);
    return NextResponse.json(
      { error: "Could not fetch metadata" },
      { status: 500 },
    );
  }
};
