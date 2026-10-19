import { getSupabaseAuth } from "@/lib/supabase-auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  const base = process.env.APP_URL!;
  if (code) {
    const supabase = await getSupabaseAuth();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}/admin`);
  }
  return NextResponse.redirect(`${base}/login?error=1`);
}
