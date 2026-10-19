import { clearSession } from "@/lib/local-auth";

export async function POST() {
  await clearSession();
  return Response.json({ ok: true });
}
