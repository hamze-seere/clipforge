// Free video generation through a public Hugging Face Space (Gradio API).
// Spaces run on Hugging Face's free ZeroGPU pool, which has a daily GPU quota:
// small without a token, bigger with a free account token in HF_TOKEN.
//
// Gradio jobs are a POST that returns an event id, then one streamed GET that
// ends with the result. The stream can only be read once, so the server reads
// it in the background (see app/api/generate) and writes the result to the job.
import "server-only";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

export const HF_SPACE = "https://lightricks-ltx-2-3.hf.space";
const ENDPOINT = "generate_video";

const headers = (): Record<string, string> => {
  const token = process.env.HF_TOKEN?.trim();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

export interface HfInput {
  prompt: string;
  image?: string; // data URI
  width: number;
  height: number;
  duration: number;
}

/** Queue a generation; returns the Gradio event id. */
export async function startHf(input: HfInput): Promise<string> {
  // LTX-2.3 generate_video: [input_image, prompt, duration, enhance_prompt, seed, randomize_seed, height, width]
  const image = input.image ? { url: input.image, meta: { _type: "gradio.FileData" } } : null;
  const res = await fetch(`${HF_SPACE}/gradio_api/call/${ENDPOINT}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ data: [image, input.prompt, input.duration, false, 0, true, input.height, input.width] }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.event_id) throw new Error(body?.error || `Hugging Face is not available right now (${res.status})`);
  return String(body.event_id);
}

/** Wait for a queued generation to finish; returns the video URL on the Space. */
export async function waitHf(eventId: string): Promise<string> {
  const res = await fetch(`${HF_SPACE}/gradio_api/call/${ENDPOINT}/${eventId}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok) throw new Error(`Hugging Face error ${res.status}`);
  const text = await res.text();

  // Server-sent events: "event: <name>\ndata: <json>\n\n"
  let last: { event: string; data: string } | undefined;
  for (const block of text.split(/\n\n+/)) {
    const event = /^event: (.*)$/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1] ?? "";
    if (event && event !== "heartbeat") last = { event, data };
  }
  if (last?.event === "complete") {
    const out = JSON.parse(last.data);
    const url = out?.[0]?.url ?? out?.[0]?.video?.url;
    if (typeof url === "string") return url;
    throw new Error("Hugging Face returned no video");
  }
  let msg = "Generation failed on Hugging Face";
  try {
    const d = JSON.parse(last?.data ?? "null");
    if (typeof d === "string" && d) msg = d;
  } catch {
    if (last?.data) msg = last.data;
  }
  if (/quota|ZeroGPU|GPU duration/i.test(msg))
    msg = "Free Hugging Face GPU quota used up for today. Add HF_TOKEN (free account) for more, or try again later.";
  throw new Error(msg);
}

// ---- local copies, so finished videos don't disappear when the Space cleans up

const dir = () => path.join(process.cwd(), "data", "videos");
const safe = (id: string) => /^[\w-]+$/.test(id);

/** Download the video to data/videos and return the app URL; falls back to the remote URL. */
export async function saveVideo(jobId: string, url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: headers(), cache: "no-store" });
    if (!res.ok) return url;
    await mkdir(dir(), { recursive: true });
    await writeFile(path.join(dir(), `${jobId}.mp4`), Buffer.from(await res.arrayBuffer()));
    return `/api/videos/${jobId}`;
  } catch {
    return url; // e.g. read-only filesystem on Vercel
  }
}

export async function readVideo(jobId: string): Promise<Buffer | undefined> {
  if (!safe(jobId)) return undefined;
  return readFile(path.join(dir(), `${jobId}.mp4`)).catch(() => undefined);
}

/** Pixel size for an aspect ratio (multiples of 32, kept small so the free quota lasts). */
export function hfSize(aspect: string) {
  if (aspect === "9:16") return { width: 448, height: 768 };
  if (aspect === "1:1") return { width: 576, height: 576 };
  return { width: 768, height: 448 };
}
