import { getSupabaseAuth } from "@/lib/supabase-auth";
import { isAllowedEmail } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  const base = process.env.APP_URL!;
  if (code) {
    const supabase = await getSupabaseAuth();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await supabase.auth.getUser();
      return NextResponse.redirect(
        `${base}${data.user?.email && isAllowedEmail(data.user.email) ? "/admin" : "/account"}`,
      );
    }
  }
  return NextResponse.redirect(`${base}/login?error=1`);
}
