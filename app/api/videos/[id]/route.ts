import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readVideo } from "@/lib/hf";

/** Serve a saved Hugging Face video to the user who made it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new Response("Not logged in", { status: 401 });
  const owns = await (await db()).get("SELECT 1 FROM jobs WHERE id = ? AND user_id = ?", id, user.id);
  const video = owns ? await readVideo(id) : undefined;
  if (!video) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(video), {
    headers: { "Content-Type": "video/mp4", "Content-Length": String(video.length), "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
