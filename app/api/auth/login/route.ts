import { getSupabaseAuth } from "@/lib/supabase-auth";
import { isAllowedEmail } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!rateLimit(`login:${ip}`, 5, 10 * 60_000)) {
    return Response.json({ error: "Too many attempts" }, { status: 429 });
  }
  const { email } = await req.json().catch(() => ({}));

  if (typeof email === "string" && isAllowedEmail(email)) {
    const supabase = await getSupabaseAuth();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // The email allowlist above is the signup gate for admin accounts.
        shouldCreateUser: true,
        emailRedirectTo: `${process.env.APP_URL}/api/auth/callback`,
      },
    });
    if (error) console.error("Login email failed:", error.message);
  }
  // Same response either way, so the allowlist can't be probed.
  return Response.json({ ok: true });
}
