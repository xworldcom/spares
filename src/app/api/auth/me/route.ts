import { requireUser } from "@/lib/auth";
import { json } from "@/lib/http";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }
  return json({ user: auth.user });
}
