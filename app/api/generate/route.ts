import { NextResponse } from "next/server";
import { getModel, type Aspect } from "@/lib/models";
import { createPrediction, isDemo } from "@/lib/replicate";
import { currentUser } from "@/lib/auth";
import { addCredits, InsufficientCredits, spendCredits } from "@/lib/credits";
import { insertJob } from "@/lib/jobs";

const MAX_PROMPT = 2000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Log in to generate videos" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const model = getModel(String(body.model ?? ""));
  if (!model) return NextResponse.json({ error: "Unknown model" }, { status: 400 });

  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  if (prompt.length > MAX_PROMPT) return NextResponse.json({ error: "Prompt is too long" }, { status: 400 });

  const image = typeof body.image === "string" && body.image ? body.image : undefined;
  if (image && !/^data:image\/(png|jpe?g|webp);base64,/.test(image))
    return NextResponse.json({ error: "Image must be PNG, JPEG or WebP" }, { status: 400 });
  if (image && image.length * 0.75 > MAX_IMAGE_BYTES)
    return NextResponse.json({ error: "Image is larger than 8 MB" }, { status: 400 });
  if (model.requiresImage && !image)
    return NextResponse.json({ error: `${model.name} needs a start image` }, { status: 400 });
  if (image && !model.imageToVideo)
    return NextResponse.json({ error: `${model.name} does not take images` }, { status: 400 });

  const aspect = (model.aspects.includes(body.aspect) ? body.aspect : model.aspects[0]) as Aspect;
  const duration = model.durations.includes(Number(body.duration)) ? Number(body.duration) : model.durations[0];
  const negativePrompt = body.negativePrompt ? String(body.negativePrompt).slice(0, 500) : undefined;
  const params = { prompt, image, aspect, duration, negativePrompt };
  const cost = model.credits(params);

  // Charge first so two parallel requests can't both spend the same credits.
  try {
    await spendCredits(user.id, cost, "generation", model.id);
  } catch (e) {
    if (e instanceof InsufficientCredits)
      return NextResponse.json({ error: "Not enough credits", needCredits: true }, { status: 402 });
    throw e;
  }

  let job;
  try {
    job = await createPrediction(model.id, model.buildInput(params));
  } catch (e: any) {
    await addCredits(user.id, cost, "refund", "provider_error");
    return NextResponse.json({ error: e?.message ?? "Generation failed" }, { status: 502 });
  }

  await insertJob(user.id, {
    id: job.id,
    prompt,
    model: model.id,
    aspect,
    duration,
    hadImage: !!image,
    credits: cost,
    status: job.status,
  });

  return NextResponse.json({ id: job.id, demo: isDemo() });
}
