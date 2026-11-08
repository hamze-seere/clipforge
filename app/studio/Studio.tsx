"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MODELS, getModel, type Aspect } from "@/lib/models";

type Status = "queued" | "processing" | "succeeded" | "failed" | "canceled";

interface Gen {
  id: string;
  prompt: string;
  model: string;
  aspect: Aspect;
  duration: number;
  hadImage: boolean;
  credits: number;
  status: Status;
  output: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  demo: boolean;
}

const EXAMPLES = [
  "A red fox trotting through fresh snow at sunrise, low tracking shot, shallow depth of field",
  "Neon-lit Tokyo alley in the rain, slow dolly forward, reflections on wet asphalt",
  "Macro shot of coffee being poured into a glass cup, steam rising, warm light",
  "Astronaut floating inside a spaceship cabin, gentle camera orbit, cinematic",
];

const active = (s: Status) => s === "queued" || s === "processing";

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return reject(new Error("Use a PNG, JPEG or WebP image"));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("Image must be under 8 MB"));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read image"));
    r.readAsDataURL(file);
  });
}

function elapsed(from: number, to = Date.now()) {
  const s = Math.max(0, Math.round((to - from) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function Studio({ initialCredits }: { initialCredits: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"t2v" | "i2v">("t2v");
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [image, setImage] = useState<string>();
  const [over, setOver] = useState(false);
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [duration, setDuration] = useState(5);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [demo, setDemo] = useState(false);
  const [, tick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const [jobs, setJobs] = useState<Gen[]>([]);
  const [credits, setCredits] = useState(initialCredits);
  const [needCredits, setNeedCredits] = useState(false);

  const available = useMemo(() => MODELS.filter((m) => (mode === "t2v" ? m.textToVideo : m.imageToVideo)), [mode]);
  const model = getModel(modelId) ?? available[0];

  // keep model/aspect/duration valid when switching mode or model
  useEffect(() => {
    if (!available.some((m) => m.id === modelId)) setModelId(available[0].id);
  }, [available, modelId]);
  useEffect(() => {
    if (!model.aspects.includes(aspect)) setAspect(model.aspects[0]);
    if (!model.durations.includes(duration)) setDuration(model.durations[0]);
  }, [model, aspect, duration]);

  const params = { prompt, aspect, duration, image: mode === "i2v" ? image : undefined };
  const cost = model.credits(params);
  const needsImage = mode === "i2v" && !image;
  const canGenerate = !!prompt.trim() && !needsImage && credits >= cost && !submitting;

  // The server is the source of truth for jobs and credits.
  const lastCredits = useRef(initialCredits);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      if (res.status === 401) return void (window.location.href = "/login?next=/studio");
      const data = await res.json();
      if (!res.ok) return;
      setJobs(data.jobs);
      setCredits(data.credits);
      setDemo(data.demo);
      if (data.credits !== lastCredits.current) {
        lastCredits.current = data.credits;
        router.refresh(); // update the balance in the nav bar
      }
    } catch {}
  }, [router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // poll while anything is running; tick every second so elapsed timers move
  const anyActive = jobs.some((j) => active(j.status));
  useEffect(() => {
    if (!anyActive) return;
    let n = 0;
    const id = setInterval(() => {
      tick((t) => t + 1);
      if (++n % 3 === 0) refresh();
    }, 1000);
    return () => clearInterval(id);
  }, [anyActive, refresh]);

  const pickImage = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      setImage(await readImage(file));
      setError(undefined);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  async function generate() {
    if (!canGenerate) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.id, prompt, aspect, duration, image: params.image, negativePrompt: negative || undefined }),
      });
      const data = await res.json();
      if (res.status === 401) return void (window.location.href = "/login?next=/studio");
      if (data.needCredits) setNeedCredits(true);
      if (!res.ok) throw new Error(data.error || "Generation failed");
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOrDelete(j: Gen) {
    await fetch(`/api/jobs/${encodeURIComponent(j.id)}`, { method: "DELETE" }).catch(() => {});
    await refresh();
  }

  function remix(j: Gen) {
    setPrompt(j.prompt);
    setMode(j.hadImage ? "i2v" : "t2v"); // the image itself isn't stored, so i2v remixes need a re-upload
    setModelId(j.model);
    setAspect(j.aspect);
    setDuration(j.duration);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="studio">
      <aside className="panel">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === "t2v"} onClick={() => setMode("t2v")}>Text → Video</button>
          <button role="tab" aria-selected={mode === "i2v"} onClick={() => setMode("i2v")}>Image → Video</button>
        </div>

        {mode === "i2v" && (
          <div>
            <div className="label">Start image</div>
            <div
              className={`drop${over ? " over" : ""}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); pickImage(e.dataTransfer.files[0]); }}
            >
              {image ? <img src={image} alt="Start frame" /> : <>Drop an image or <u>browse</u><br /><small>PNG, JPEG, WebP · max 8 MB</small></>}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
            </div>
            {image && <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setImage(undefined)}>Remove image</button>}
          </div>
        )}

        <div>
          <div className="label"><span>Prompt</span><span>{prompt.length}/2000</span></div>
          <textarea
            rows={5}
            maxLength={2000}
            placeholder={mode === "t2v" ? "Describe the shot: subject, action, camera, lighting, style…" : "Describe how the image should move…"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
          />
          <div className="chips">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="chip" onClick={() => setPrompt(ex)}>{ex.split(",")[0]}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="label">Model</div>
          <div className="models">
            {available.map((m) => (
              <button key={m.id} className="model" aria-pressed={m.id === model.id} onClick={() => setModelId(m.id)}>
                <div><strong>{m.name}</strong><span>{m.tagline}</span></div>
                <span className="cost">{m.credits({ ...params, duration: m.durations[0] }) || "Free"}{m.credits({ ...params, duration: m.durations[0] }) ? " cr" : ""}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div className="label">Aspect ratio</div>
            <div className="pills">
              {model.aspects.map((a) => (
                <button key={a} className="pill" aria-pressed={a === aspect} onClick={() => setAspect(a)}>{a}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">Duration</div>
            <div className="pills">
              {model.durations.map((d) => (
                <button key={d} className="pill" aria-pressed={d === duration} onClick={() => setDuration(d)}>{d}s</button>
              ))}
            </div>
          </div>
        </div>

        <details>
          <summary>Advanced</summary>
          <div style={{ marginTop: 10 }}>
            <div className="label">Negative prompt</div>
            <input className="input" placeholder="blurry, text, watermark, distorted hands" value={negative} onChange={(e) => setNegative(e.target.value)} />
            <small style={{ color: "var(--muted)" }}>Used by models that support it (Kling, Veo).</small>
          </div>
        </details>

        <div className="generate">
          <button className="btn btn-primary btn-lg" disabled={!canGenerate} onClick={generate}>
            {submitting ? "Sending…" : cost === 0 ? "Generate · free" : `Generate · ${cost} credits`}
          </button>
          {needsImage && <div className="err" style={{ color: "var(--muted)" }}>Add a start image to animate.</div>}
          {(credits < cost || needCredits) && (
            <div className="err">
              Not enough credits. <Link href="/billing" style={{ textDecoration: "underline" }}>Buy credits</Link>
            </div>
          )}
          {error && <div className="err">{error}</div>}
        </div>
      </aside>

      <section className="feed">
        <div className="feed-head">
          <h1>Your generations</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="credits">{credits} credits</span>
            <Link className="btn btn-sm btn-primary" href="/billing">Buy credits</Link>
          </div>
        </div>

        {(jobs.some((j) => j.demo) || (demo && model.provider !== "hf")) && (
          <div className="banner">
            Demo mode for paid models: no <code>REPLICATE_API_TOKEN</code> is set, so they return sample clips. <strong>LTX-2.3 Free</strong> makes real videos on Hugging Face at no cost.
          </div>
        )}

        {jobs.length === 0 ? (
          <div className="empty">
            No videos yet. Write a prompt on the left and press <strong>Generate</strong>.
          </div>
        ) : (
          <div className="grid">
            {jobs.map((j) => (
              <article className="card" key={j.id}>
                <div className="media" data-aspect={j.aspect}>
                  {j.status === "succeeded" && j.output ? (
                    <video src={j.output} controls loop playsInline preload="metadata" />
                  ) : active(j.status) ? (
                    <>
                      <div className="shimmer" />
                      <div className="pending">
                        <div className="spinner" />
                        {j.status === "queued" ? "Waiting for a GPU…" : "Rendering frames…"}
                        <span>{elapsed(j.createdAt)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="pending" style={{ color: "var(--bad)" }}>
                      {j.status === "canceled" ? "Canceled" : j.error || "Generation failed"}
                      <span style={{ color: "var(--muted)" }}>Credits refunded</span>
                    </div>
                  )}
                </div>
                <div className="card-body">
                  <p title={j.prompt}>{j.prompt}</p>
                  <div className="meta">
                    <span className={`badge ${j.status}`}>{j.status}</span>
                    <span>{getModel(j.model)?.name ?? j.model}</span>
                    <span>{j.aspect} · {j.duration}s</span>
                    {j.finishedAt && j.status === "succeeded" && <span>in {elapsed(j.createdAt, j.finishedAt)}</span>}
                  </div>
                  <div className="actions">
                    {j.status === "succeeded" && j.output && (
                      <a className="btn btn-sm" href={j.output} target="_blank" rel="noreferrer" download>Download</a>
                    )}
                    <button className="btn btn-sm" onClick={() => remix(j)}>Remix</button>
                    {active(j.status) ? (
                      <button className="btn btn-sm" onClick={() => cancelOrDelete(j)}>Cancel</button>
                    ) : (
                      <button className="btn btn-sm" onClick={() => cancelOrDelete(j)}>Delete</button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
