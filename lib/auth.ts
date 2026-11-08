import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db, isUniqueViolation, tx } from "./db";
import { SIGNUP_BONUS } from "./credits";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "cf_session";
const SESSION_DAYS = 30;
// Used when the email isn't registered, so a failed login takes the same time either way.
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

export interface User {
  id: number;
  email: string;
  credits: number;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algo, saltHex, keyHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scryptAsync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "Enter a valid email address";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 200) return "Password is too long";
  return null;
}

/** Returns the new user id, or null if the email is taken. */
export async function createUser(email: string, password: string): Promise<number | null> {
  const hash = await hashPassword(password);
  const now = Date.now();
  try {
    return await tx(async (d) => {
      const row = await d.get<{ id: number }>(
        "INSERT INTO users (email, password_hash, credits, created_at) VALUES (?, ?, ?, ?) RETURNING id",
        email, hash, SIGNUP_BONUS, now,
      );
      const id = Number(row!.id);
      await d.run("INSERT INTO credit_ledger (user_id, delta, reason, created_at) VALUES (?, ?, 'signup_bonus', ?)", id, SIGNUP_BONUS, now);
      return id;
    });
  } catch (e: any) {
    if (isUniqueViolation(e)) return null;
    throw e;
  }
}

export async function checkLogin(email: string, password: string): Promise<number | null> {
  const row = await (await db()).get<{ id: number; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", email);
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  return row && ok ? row.id : null;
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = Date.now() + SESSION_DAYS * 864e5;
  const d = await db();
  await d.run("DELETE FROM sessions WHERE expires_at < ?", Date.now());
  await d.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", sha256(token), userId, expires);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await (await db()).run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = await (await db()).get<User>(
    `SELECT u.id, u.email, u.credits FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    sha256(token),
    Date.now(),
  );
  return row ? { id: row.id, email: row.email, credits: row.credits } : null;
}
