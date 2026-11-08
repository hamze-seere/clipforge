# ClipForge: AI video generator SaaS (MVP)

Text-to-video and image-to-video studio built with Next.js. Generation runs on
hosted models (Veo 3, Kling 2.1, Seedance, MiniMax, Wan) through the
[Replicate](https://replicate.com) API.

Live: https://clipforge-olive-one.vercel.app (Vercel + Neon Postgres). Every push to `main` deploys.

## Run it

```bash
npm install
cp .env.example .env.local   # add REPLICATE_API_TOKEN for real generations
npm run dev                  # http://localhost:3000
```

Without a token the app runs in **demo mode**: each job takes about 9 seconds and returns a sample clip.

## How it works

| File | What it does |
| --- | --- |
| `lib/models.ts` | Model catalog: capabilities, credit cost and each model's input mapping |
| `lib/replicate.ts` | Creates, polls and cancels predictions (server only, keeps the token private) |
| `lib/db.ts` | Database: Postgres when `DATABASE_URL` is set, otherwise a local SQLite file (`data/app.db`) |
| `lib/auth.ts` | Email + password accounts (scrypt), session cookie |
| `lib/credits.ts` | Atomic spend/add with a ledger; 50-credit signup bonus |
| `lib/jobs.ts` | Jobs per user; refreshes status from Replicate, refunds failed/canceled jobs once |
| `lib/stripe.ts`, `lib/packs.ts` | Credit packs and idempotent Stripe fulfillment |
| `app/api/generate/route.ts` | Checks the user, spends credits, starts a generation (refunds if the provider errors) |
| `app/api/jobs/...` | List jobs + balance (GET), cancel or delete a job (DELETE) |
| `app/api/auth/*` | Sign up, log in, log out |
| `app/api/checkout`, `app/api/stripe/webhook` | Stripe Checkout and the webhook that adds credits |
| `app/studio/`, `app/billing/`, `app/login/` | Studio UI, credits and history, auth page |
| `app/page.tsx` | Landing page and pricing |

Add a model by adding an entry to `MODELS`. Check the model's **API** tab on
Replicate for its exact input field names, because they differ between models.

## Payments (Stripe)

Without `STRIPE_SECRET_KEY` (and outside production), buying a pack adds credits
instantly with no payment, so you can test the flow. To take real test-mode payments:

1. Put your Stripe **test** secret key in `.env.local` as `STRIPE_SECRET_KEY`.
2. Forward webhooks locally and copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

3. Pay with Stripe's test card `4242 4242 4242 4242`. Credits are added on the
   success page and again (safely, once only) by the webhook.

In production, add a webhook endpoint in the Stripe dashboard for
`checkout.session.completed` and `checkout.session.async_payment_succeeded`, and set `APP_URL`.

## Not production-ready yet

- **Storage:** Replicate output URLs expire after about an hour. Copy finished videos to S3, R2 or Supabase Storage.
- **Webhooks:** pass `webhook` when creating a prediction instead of polling while the studio is open.
- **Accounts:** add password reset and email verification (or swap in Auth.js / Clerk).
- **Abuse:** add rate limits per user and IP, and moderate prompts.

## Local test account

Created while testing on localhost (local SQLite only):

- Email: `demo@clipforge.test`
- Password: `cf-199dd3279b2b`

Delete `data/app.db` to reset all accounts.
