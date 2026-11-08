import Link from "next/link";
import { PACKS, formatUsd } from "@/lib/packs";

const SHOWCASE = [
  { src: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", caption: "“A campfire at dusk, sparks drifting up, slow push-in”" },
  { src: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4", caption: "“Aerial shot over a coastal road, golden hour”" },
  { src: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4", caption: "“Handheld POV of a car on a mountain pass”" },
];

const FEATURES = [
  { t: "Text to video", d: "Describe a shot in plain words. Camera moves, lighting and style all come from the prompt." },
  { t: "Image to video", d: "Upload a photo or product shot and animate it. The first frame stays exactly yours." },
  { t: "Every top model", d: "Veo, Kling, Seedance, MiniMax and Wan in one place. Pick by quality, speed or price." },
  { t: "Any format", d: "16:9 for YouTube, 9:16 for Reels and TikTok, 1:1 for feeds. Pick it before you generate." },
  { t: "One credit balance", d: "No juggling subscriptions to five AI labs. Credits work across every model and never expire." },
  { t: "Your library", d: "Every generation is saved with its prompt, so you can remix, download or try another model." },
];


export default function Home() {
  return (
    <main>
      <section className="hero container">
        <span className="eyebrow">Veo 3 · Kling 2.1 · Seedance · MiniMax · Wan</span>
        <h1>Type a scene.<br /><em>Get the video.</em></h1>
        <p>ClipForge turns a prompt or a photo into a video clip in about a minute. One studio for every leading AI video model.</p>
        <div className="hero-cta">
          <Link href="/login?mode=signup" className="btn btn-primary btn-lg">Start free, 50 credits</Link>
          <Link href="#pricing" className="btn btn-lg">See pricing</Link>
        </div>
      </section>

      <div className="container showcase">
        {SHOWCASE.map((s) => (
          <figure key={s.src}>
            <video src={s.src} autoPlay muted loop playsInline preload="metadata" />
            <figcaption>{s.caption}</figcaption>
          </figure>
        ))}
      </div>

      <section className="section" id="features">
        <div className="container">
          <h2>Everything you need to make the shot</h2>
          <p className="lead">No timeline to learn, no render farm to rent. Write what you want to see.</p>
          <div className="features">
            {FEATURES.map((f, i) => (
              <div className="feature" key={f.t}>
                <span className="num">0{i + 1}</span>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="container">
          <h2>Pay for what you make</h2>
          <p className="lead">Sign up and get 50 free credits, then buy a pack when you need more. A 5-second draft costs 5 credits; a Veo 3 clip with sound costs 80.</p>
          <div className="pricing">
            {PACKS.map((p) => (
              <div className={`plan${p.featured ? " featured" : ""}`} key={p.id}>
                <h3>{p.name}</h3>
                <div className="price">{formatUsd(p.priceCents)}</div>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>{p.credits.toLocaleString("en-US")} credits · one-time</div>
                <ul><li>{p.blurb}</li><li>Credits never expire</li><li>Every model included</li></ul>
                <Link href="/login?mode=signup" className={`btn ${p.featured ? "btn-primary" : ""}`}>Start free</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">© {new Date().getFullYear()} ClipForge</div>
      </footer>
    </main>
  );
}
