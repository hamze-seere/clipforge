import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { cancelOrDelete } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

/** Cancel a running job (credits are refunded) or remove a finished one from the library. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const { id } = await params;
  const found = await cancelOrDelete(user.id, id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
