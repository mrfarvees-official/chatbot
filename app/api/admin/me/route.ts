import { requireAdmin, unauthorized } from "@/lib/auth";

export async function GET() {
  const user = await requireAdmin();
  return user ? Response.json({ email: user.email }) : unauthorized();
}
