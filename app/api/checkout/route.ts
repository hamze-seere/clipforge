import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { getPack } from "@/lib/packs";
import { recordPayment, stripe, stripeDemo } from "@/lib/stripe";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Log in to buy credits" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pack = getPack(String(body.pack ?? ""));
  if (!pack) return NextResponse.json({ error: "Unknown pack" }, { status: 400 });

  // Local development without Stripe keys: grant the pack straight away.
  if (stripeDemo()) {
    await recordPayment(user.id, `test_${randomUUID()}`, pack, 0);
    return NextResponse.json({ url: `/billing?test_purchase=${pack.id}` });
  }

  if (!process.env.STRIPE_SECRET_KEY?.trim())
    return NextResponse.json({ error: "Payments aren't switched on yet. Check back soon." }, { status: 503 });

  const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: String(user.id),
      metadata: { userId: String(user.id), pack: pack.id },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pack.priceCents,
            product_data: { name: `ClipForge ${pack.name}: ${pack.credits.toLocaleString("en-US")} credits` },
          },
        },
      ],
      success_url: `${origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?canceled=1`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not start checkout" }, { status: 502 });
  }
}
