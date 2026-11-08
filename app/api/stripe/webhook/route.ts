import { NextResponse } from "next/server";
import { fulfillCheckout, stripe } from "@/lib/stripe";

// Stripe calls this after a payment. Point a webhook at /api/stripe/webhook for
// checkout.session.completed and checkout.session.async_payment_succeeded.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });

  const payload = await req.text(); // the raw body is needed to verify the signature
  let event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    try {
      await fulfillCheckout(event.data.object.id);
    } catch (e: any) {
      // a non-2xx makes Stripe retry later
      return NextResponse.json({ error: e?.message ?? "Fulfillment failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
