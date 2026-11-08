import "server-only";
import Stripe from "stripe";
import { tx } from "./db";
import { getPack, type Pack } from "./packs";

const key = () => process.env.STRIPE_SECRET_KEY?.trim();

/** True when no Stripe key is set: purchases are granted instantly (never in production). */
export const stripeDemo = () => !key() && process.env.NODE_ENV !== "production";

let client: Stripe | undefined;
export function stripe(): Stripe {
  const k = key();
  if (!k) throw new Error("STRIPE_SECRET_KEY is not set");
  return (client ??= new Stripe(k));
}

/**
 * Credit a purchase exactly once. `payments.stripe_session_id` is the primary
 * key, so the webhook and the success-page redirect can both call this safely.
 */
export function recordPayment(userId: number, sessionId: string, pack: Pack, amountCents: number): Promise<boolean> {
  return tx(async (d) => {
    const inserted = await d.run(
      `INSERT INTO payments (stripe_session_id, user_id, pack, credits, amount_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (stripe_session_id) DO NOTHING`,
      sessionId, userId, pack.id, pack.credits, amountCents, Date.now(),
    );
    if (inserted === 0) return false;
    await d.run("UPDATE users SET credits = credits + ? WHERE id = ?", pack.credits, userId);
    await d.run("INSERT INTO credit_ledger (user_id, delta, reason, ref, created_at) VALUES (?, ?, 'purchase', ?, ?)", userId, pack.credits, sessionId, Date.now());
    return true;
  });
}

export type FulfillResult = { ok: true; credits: number; userId: number } | { ok: false; reason: string };

/** Look a Checkout Session up at Stripe and credit it if it's paid. */
export async function fulfillCheckout(sessionId: string): Promise<FulfillResult> {
  const s = await stripe().checkout.sessions.retrieve(sessionId);
  if (s.mode !== "payment") return { ok: false, reason: "not a payment session" };
  if (s.payment_status !== "paid") return { ok: false, reason: "payment not completed" };
  const userId = Number(s.metadata?.userId ?? s.client_reference_id);
  const pack = getPack(String(s.metadata?.pack ?? ""));
  if (!userId || !pack) return { ok: false, reason: "missing metadata" };
  await recordPayment(userId, s.id, pack, s.amount_total ?? pack.priceCents);
  return { ok: true, credits: pack.credits, userId };
}
