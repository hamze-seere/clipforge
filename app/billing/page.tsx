import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PACKS, formatUsd, getPack } from "@/lib/packs";
import { fulfillCheckout, stripeDemo } from "@/lib/stripe";
import BuyButton from "./BuyButton";

const REASONS: Record<string, string> = {
  signup_bonus: "Welcome bonus",
  purchase: "Credit purchase",
  generation: "Video generation",
  refund: "Refund (failed or canceled job)",
};

type Search = Promise<{ session_id?: string; canceled?: string; test_purchase?: string }>;

export default async function BillingPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  let user = await currentUser();
  if (!user) redirect("/login?next=/billing");

  // Back from Stripe Checkout: credit right away instead of waiting for the webhook.
  let notice: { ok: boolean; text: string } | undefined;
  if (sp.session_id) {
    try {
      const r = await fulfillCheckout(sp.session_id);
      notice = r.ok && r.userId === user.id
        ? { ok: true, text: `Payment received. ${r.credits.toLocaleString("en-US")} credits added.` }
        : { ok: false, text: "We couldn't confirm that payment yet. If you were charged, credits will appear shortly." };
    } catch {
      notice = { ok: false, text: "We couldn't reach Stripe to confirm the payment. Refresh in a moment." };
    }
    user = (await currentUser())!;
  } else if (sp.test_purchase) {
    const p = getPack(sp.test_purchase);
    if (p) notice = { ok: true, text: `Test purchase: ${p.credits.toLocaleString("en-US")} credits added. No payment was taken.` };
  } else if (sp.canceled) {
    notice = { ok: false, text: "Checkout canceled. You weren't charged." };
  }

  const ledger = await (await db()).all<{ delta: number; reason: string; at: number }>(
    "SELECT delta, reason, created_at AS at FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 25",
    user.id,
  );

  return (
    <main className="container billing">
      <h1>Credits &amp; billing</h1>
      <div className="balance">
        <strong>{user.credits.toLocaleString("en-US")}</strong>
        <span style={{ color: "var(--muted)" }}>credits available</span>
      </div>

      {notice && <div className={`notice ${notice.ok ? "ok" : "bad"}`}>{notice.text}</div>}
      {stripeDemo() && (
        <div className="banner">
          Test mode: no <code>STRIPE_SECRET_KEY</code> is set, so buying a pack adds credits instantly without payment.
        </div>
      )}

      <div className="pricing" style={{ marginBottom: 48 }}>
        {PACKS.map((p) => (
          <div className={`plan${p.featured ? " featured" : ""}`} key={p.id}>
            <h3>{p.name}</h3>
            <div className="price">{formatUsd(p.priceCents)}</div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>{p.credits.toLocaleString("en-US")} credits · one-time</div>
            <ul><li>{p.blurb}</li><li>Credits never expire</li><li>Works with every model</li></ul>
            <BuyButton pack={p.id} label={`Buy ${p.name}`} primary={p.featured} />
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>History</h2>
      <table className="table">
        <thead><tr><th>Date</th><th>Activity</th><th style={{ textAlign: "right" }}>Credits</th></tr></thead>
        <tbody>
          {ledger.map((l, i) => (
            <tr key={i}>
              <td>{new Date(l.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td>{REASONS[l.reason] ?? l.reason}</td>
              <td className={`num ${l.delta > 0 ? "plus" : "minus"}`} style={{ textAlign: "right" }}>
                {l.delta > 0 ? "+" : ""}{l.delta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
