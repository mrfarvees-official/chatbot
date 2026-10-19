import { getSupabaseAuth } from "@/lib/supabase-auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const supabase = await getSupabaseAuth();
  const redirectTo = new URL("/api/auth/callback", req.url).toString();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error || !data.url) {
    console.error("Google login failed:", error?.message ?? "Missing OAuth URL");
    return NextResponse.redirect(new URL("/login?error=google", req.url));
  }

  return NextResponse.redirect(data.url);
}
