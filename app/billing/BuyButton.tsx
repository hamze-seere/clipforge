"use client";

import { useState } from "react";

export default function BuyButton({ pack, label, primary }: { pack: string; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function buy() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout");
      window.location.href = data.url; // Stripe Checkout, or straight back here in test mode
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button className={`btn ${primary ? "btn-primary" : ""}`} onClick={buy} disabled={busy}>
        {busy ? "Opening checkout…" : label}
      </button>
      {error && <div className="err">{error}</div>}
    </>
  );
}
