import { NextResponse } from "next/server";
import { createUser, normalizeEmail, startSession, validateCredentials } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const invalid = validateCredentials(email, password);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const id = await createUser(email, password);
  if (id === null) return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });

  await startSession(id);
  return NextResponse.json({ ok: true });
}
