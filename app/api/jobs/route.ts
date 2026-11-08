import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { listJobs } from "@/lib/jobs";
import { db } from "@/lib/db";
import { isDemo } from "@/lib/replicate";

/** The signed-in user's jobs (running ones refreshed from the provider) and current balance. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const jobs = await listJobs(user.id);
  const row = await (await db()).get<{ credits: number }>("SELECT credits FROM users WHERE id = ?", user.id);
  const credits = row?.credits ?? 0;
  return NextResponse.json({ jobs, credits, demo: isDemo() });
}
