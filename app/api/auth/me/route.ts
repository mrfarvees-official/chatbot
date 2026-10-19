import { isAllowedEmail, requireUser } from "@/lib/auth";
import { getSupabaseAuth } from "@/lib/supabase-auth";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ authenticated: false }, { status: 401 });

  const supabase = await getSupabaseAuth();
  const { data } = await supabase
    .from("profiles")
    .select("first_name, last_name, full_name, mobile_number")
    .eq("id", user.id)
    .maybeSingle();

  return Response.json({
    authenticated: true,
    email: user.email,
    isAdmin: Boolean(user.email && isAllowedEmail(user.email)),
    profile: data,
  });
}
