import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Studio from "./Studio";

export default async function StudioPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/studio");
  return <Studio initialCredits={user.credits} />;
}
