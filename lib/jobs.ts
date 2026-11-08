import "server-only";
import { db, tx } from "./db";
import { cancelPrediction, getPrediction, type JobStatus } from "./replicate";

export interface JobRow {
  id: string;
  prompt: string;
  model: string;
  aspect: string;
  duration: number;
  hadImage: boolean;
  credits: number;
  status: JobStatus;
  output: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  demo: boolean;
}

const COLS = `id, prompt, model, aspect, duration, had_image AS "hadImage", credits, status, output, error,
  created_at AS "createdAt", finished_at AS "finishedAt"`;

const isActive = (s: string) => s === "queued" || s === "processing";

function toRow(r: any): JobRow {
  return { ...r, hadImage: !!r.hadImage, demo: String(r.id).startsWith("demo_") };
}

export async function insertJob(userId: number, j: Omit<JobRow, "output" | "error" | "createdAt" | "finishedAt" | "demo">) {
  await (await db()).run(
    `INSERT INTO jobs (id, user_id, prompt, model, aspect, duration, had_image, credits, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    j.id, userId, j.prompt, j.model, j.aspect, j.duration, j.hadImage ? 1 : 0, j.credits, j.status, Date.now(),
  );
}

async function getOwned(userId: number, id: string): Promise<JobRow | undefined> {
  const r = await (await db()).get(`SELECT ${COLS} FROM jobs WHERE id = ? AND user_id = ? AND deleted = 0`, id, userId);
  return r ? toRow(r) : undefined;
}

/**
 * Record a provider status change. Moving to failed/canceled refunds the job's
 * credits exactly once; the `status IN (queued, processing)` guard makes this
 * safe when two polls race.
 */
async function applyStatus(userId: number, job: JobRow, status: JobStatus, output?: string, error?: string) {
  if (status === job.status && !output) return;
  await tx(async (d) => {
    const done = !isActive(status);
    const changed = await d.run(
      `UPDATE jobs SET status = ?, output = ?, error = ?, finished_at = ?
       WHERE id = ? AND user_id = ? AND status IN ('queued','processing')`,
      status, output ?? null, error ?? null, done ? Date.now() : null, job.id, userId,
    );
    if (changed === 0) return;
    if (status === "failed" || status === "canceled") {
      const refunded = await d.run("UPDATE jobs SET refunded = 1 WHERE id = ? AND refunded = 0", job.id);
      if (refunded > 0) {
        await d.run("UPDATE users SET credits = credits + ? WHERE id = ?", job.credits, userId);
        await d.run("INSERT INTO credit_ledger (user_id, delta, reason, ref, created_at) VALUES (?, ?, 'refund', ?, ?)", userId, job.credits, job.id, Date.now());
      }
    }
  });
}

const HF_TIMEOUT = 15 * 60_000;

/** Record the result of a background (Hugging Face) job. */
export async function finishJob(userId: number, id: string, status: JobStatus, output?: string, error?: string) {
  const job = await getOwned(userId, id);
  if (job) await applyStatus(userId, job, status, output, error);
}

/** List a user's jobs, refreshing any that are still running from the provider first. */
export async function listJobs(userId: number): Promise<JobRow[]> {
  const list = async () =>
    (await (await db()).all(`SELECT ${COLS} FROM jobs WHERE user_id = ? AND deleted = 0 ORDER BY created_at DESC LIMIT 100`, userId)).map(toRow);
  const rows = await list();

  await Promise.all(
    rows.filter((r) => isActive(r.status)).map(async (r) => {
      // Hugging Face jobs are written by the request that started them; only time out lost ones.
      if (r.id.startsWith("hf_")) {
        if (Date.now() - r.createdAt > HF_TIMEOUT) await applyStatus(userId, r, "failed", undefined, "Timed out (the server restarted or Hugging Face is busy)");
        return;
      }
      try {
        const p = await getPrediction(r.id);
        await applyStatus(userId, r, p.status, p.output, p.error);
      } catch {
        // provider hiccup: leave the job as-is and try again on the next poll
      }
    }),
  );

  return list();
}

/** Cancel a running job (with refund), or hide a finished one. Returns false if not found. */
export async function cancelOrDelete(userId: number, id: string): Promise<boolean> {
  const job = await getOwned(userId, id);
  if (!job) return false;
  if (isActive(job.status)) {
    if (!id.startsWith("hf_")) await cancelPrediction(id).catch(() => {});
    await applyStatus(userId, job, "canceled");
  } else {
    await (await db()).run("UPDATE jobs SET deleted = 1 WHERE id = ? AND user_id = ?", id, userId);
  }
  return true;
}
