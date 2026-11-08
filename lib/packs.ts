// Credit packs sold through Stripe Checkout. Prices are created inline at
// checkout time, so there is nothing to set up in the Stripe dashboard.
export interface Pack {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  blurb: string;
  featured?: boolean;
}

export const PACKS: Pack[] = [
  { id: "starter", name: "Starter", credits: 500, priceCents: 1000, blurb: "About 100 quick drafts or 6 Veo clips" },
  { id: "creator", name: "Creator", credits: 1500, priceCents: 2500, blurb: "Best for weekly content", featured: true },
  { id: "studio", name: "Studio", credits: 4000, priceCents: 6000, blurb: "For teams and heavy users" },
];

export const getPack = (id: string) => PACKS.find((p) => p.id === id);
export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
