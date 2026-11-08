// Server-only wrapper around the Replicate predictions API, plus a demo mode
// that fakes generations when no API token is configured.
import "server-only";

export type JobStatus = "queued" | "processing" | "succeeded" | "failed" | "canceled";

export interface Job {
  id: string;
  status: JobStatus;
  output?: string;
  error?: string;
  demo?: boolean;
}

const API = "https://api.replicate.com/v1";
const token = () => process.env.REPLICATE_API_TOKEN?.trim();

export const isDemo = () => !token();

function mapStatus(s: string): JobStatus {
  if (s === "starting") return "queued";
  if (s === "processing") return "processing";
  if (s === "succeeded") return "succeeded";
  if (s === "canceled") return "canceled";
  return "failed";
}

function firstUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.find((o) => typeof o === "string");
  return undefined;
}

async function replicate(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.detail || body?.title || `Replicate error ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body;
}

function toJob(p: any): Job {
  return {
    id: p.id,
    status: mapStatus(p.status),
    output: firstUrl(p.output),
    error: p.error ? String(p.error) : undefined,
  };
}

export async function createPrediction(model: string, input: Record<string, unknown>): Promise<Job> {
  if (isDemo()) return { id: `demo_${Date.now()}_${Math.floor(Math.random() * 1e6)}`, status: "queued", demo: true };
  return toJob(await replicate(`/models/${model}/predictions`, { method: "POST", body: JSON.stringify({ input }) }));
}

export async function getPrediction(id: string): Promise<Job> {
  if (id.startsWith("demo_")) return demoJob(id);
  return toJob(await replicate(`/predictions/${encodeURIComponent(id)}`));
}

export async function cancelPrediction(id: string): Promise<void> {
  if (id.startsWith("demo_")) return;
  await replicate(`/predictions/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

// ---- demo mode: status is derived from the timestamp in the id, so no storage is needed
const SAMPLES = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
];

function demoJob(id: string): Job {
  const [, ts, rnd] = id.split("_");
  const elapsed = Date.now() - Number(ts);
  if (elapsed < 2500) return { id, status: "queued", demo: true };
  if (elapsed < 9000) return { id, status: "processing", demo: true };
  return { id, status: "succeeded", output: SAMPLES[Number(rnd) % SAMPLES.length], demo: true };
}
