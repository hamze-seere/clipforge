// Free video generation through a public Hugging Face Space (Gradio API).
// Spaces run on Hugging Face's free ZeroGPU pool, which has a daily GPU quota:
// small without a token, bigger with a free account token in HF_TOKEN.
//
// Gradio jobs use the queue API: POST /queue/join, then one streamed GET of
// /queue/data that ends with the result or a readable error. The stream can only
// be read once, so the server reads it in the background (see app/api/generate).
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

let fnIndex: Promise<number> | undefined;
function getFnIndex() {
  fnIndex ??= fetch(`${HF_SPACE}/config`, { cache: "no-store" })
    .then((r) => r.json())
    .then((c) => {
      const dep = c.dependencies?.find((x: any) => x.api_name === ENDPOINT);
      if (!dep) throw new Error("Hugging Face Space changed; the free model needs an update");
      return Number(dep.id ?? c.dependencies.indexOf(dep));
    })
    .catch((e) => {
      fnIndex = undefined;
      throw e;
    });
  return fnIndex;
}

/** Queue a generation; returns a session id to pass to waitHf. */
export async function startHf(input: HfInput): Promise<string> {
  // LTX-2.3 generate_video: [input_image, prompt, duration, enhance_prompt, seed, randomize_seed, height, width]
  const image = input.image ? { url: input.image, meta: { _type: "gradio.FileData" } } : null;
  const session = crypto.randomUUID().replaceAll("-", "");
  const res = await fetch(`${HF_SPACE}/gradio_api/queue/join`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: [image, input.prompt, input.duration, false, 0, true, input.height, input.width],
      fn_index: await getFnIndex(),
      session_hash: session,
      event_data: null,
      trigger_id: null,
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.event_id) throw new Error(friendly(body?.detail || body?.error) || `Hugging Face is not available right now (${res.status})`);
  return session;
}

/** Wait for a queued generation to finish; returns the video URL on the Space. */
export async function waitHf(session: string): Promise<string> {
  const res = await fetch(`${HF_SPACE}/gradio_api/queue/data?session_hash=${session}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok) throw new Error(`Hugging Face error ${res.status}`);
  const text = await res.text();

  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    let m: any;
    try {
      m = JSON.parse(line.slice(6));
    } catch {
      continue;
    }
    if (m?.msg !== "process_completed") continue;
    if (!m.success) throw new Error(friendly(m.output?.error || m.title) || "Generation failed on Hugging Face");
    const out = m.output?.data?.[0];
    const url = out?.url ?? out?.video?.url;
    if (typeof url === "string") return url;
    throw new Error("Hugging Face returned no video");
  }
  throw new Error("Hugging Face closed the connection before the video was ready");
}

/** Turn Hugging Face errors into a short message for the studio. */
function friendly(msg?: string): string | undefined {
  if (!msg) return undefined;
  if (/ZeroGPU quota|exceeded your GPU quota/i.test(msg)) {
    const wait = /Try again in ([\d:]+)/.exec(msg)?.[1];
    const when = wait ? ` It resets in ${wait.replace(/^(\d+):(\d+):\d+$/, "$1h $2m")}.` : "";
    return process.env.HF_TOKEN?.trim()
      ? `Your free Hugging Face GPU time for today is used up.${when}`
      : `Free Hugging Face GPU time without an account is used up.${when} Add a free HF_TOKEN for more.`;
  }
  return msg.length > 300 ? msg.slice(0, 300) + "…" : msg;
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
