import "server-only";
import { tx } from "./db";

export const SIGNUP_BONUS = 50;

export class InsufficientCredits extends Error {}

/** Atomically take credits; throws InsufficientCredits if the balance is too low. */
export async function spendCredits(userId: number, amount: number, reason: string, ref?: string) {
  await tx(async (d) => {
    const changed = await d.run("UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?", amount, userId, amount);
    if (changed === 0) throw new InsufficientCredits("Not enough credits");
    await d.run("INSERT INTO credit_ledger (user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?)", userId, -amount, reason, ref ?? null, Date.now());
  });
}

export async function addCredits(userId: number, amount: number, reason: string, ref?: string) {
  await tx(async (d) => {
    await d.run("UPDATE users SET credits = credits + ? WHERE id = ?", amount, userId);
    await d.run("INSERT INTO credit_ledger (user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?)", userId, amount, reason, ref ?? null, Date.now());
  });
}
