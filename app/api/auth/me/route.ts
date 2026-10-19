import { isAllowedEmail, requireUser } from "@/lib/auth";
import { db, sql } from "@/lib/local-db";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ authenticated: false }, { status: 401 });

  const data = db.get(sql`select first_name, last_name, full_name, mobile_number from profiles where user_id = ${user.id}`);

  return Response.json({
    authenticated: true,
    email: user.email,
    isAdmin: Boolean(user.email && isAllowedEmail(user.email)),
    profile: data,
  });
}
