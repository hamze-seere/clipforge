"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function safeNext(next: string | null) {
  // only allow same-site relative paths, to avoid open redirects
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/studio";
}

function AuthForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      // full navigation so the server-rendered nav picks up the new session
      window.location.href = safeNext(params.get("next"));
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  const signup = mode === "signup";
  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>{signup ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-sub">{signup ? "Get 50 free credits to try every model." : "Log in to keep generating."}</p>

        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="label" htmlFor="password" style={{ marginTop: 14 }}>Password</label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          minLength={signup ? 8 : undefined}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {signup && <small style={{ color: "var(--muted)" }}>At least 8 characters.</small>}

        {error && <div className="err">{error}</div>}

        <button className="btn btn-primary btn-lg" style={{ width: "100%", marginTop: 20 }} disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Log in"}
        </button>

        <p className="auth-switch">
          {signup ? "Already have an account?" : "New to ClipForge?"}{" "}
          <button type="button" onClick={() => { setMode(signup ? "login" : "signup"); setError(undefined); }}>
            {signup ? "Log in" : "Create an account"}
          </button>
        </p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
