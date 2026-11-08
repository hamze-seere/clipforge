import { NextResponse } from "next/server";
import { checkLogin, normalizeEmail, startSession } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (!email || !password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });

  const id = await checkLogin(email, password);
  if (id === null) return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });

  await startSession(id);
  return NextResponse.json({ ok: true });
}
