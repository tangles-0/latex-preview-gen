import { POST as postThumbnailJob } from "@/app/api/thumbnail-jobs/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postThumbnailJob;
