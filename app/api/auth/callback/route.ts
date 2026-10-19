import { createSession, isAllowedEmail, upsertUser } from "@/lib/local-auth";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const base = process.env.APP_URL || requestUrl.origin;
  const expected = (await cookies()).get("google_oauth_state")?.value;
  if (!code || !state || state !== expected) return NextResponse.redirect(`${base}/login?error=google`);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.redirect(`${base}/login?error=google_config`);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: new URL("/api/auth/callback", req.url).toString(), grant_type: "authorization_code" }) });
  if (!tokenResponse.ok) return NextResponse.redirect(`${base}/login?error=google`);
  const tokens = await tokenResponse.json() as { access_token?: string };
  if (!tokens.access_token) return NextResponse.redirect(`${base}/login?error=google`);
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = await profileResponse.json() as { email?: string; email_verified?: boolean };
  if (!profileResponse.ok || !profile.email || profile.email_verified === false) return NextResponse.redirect(`${base}/login?error=google`);
  const user = upsertUser({ email: profile.email, provider: "google" });
  await createSession(user.id);
  const response = NextResponse.redirect(`${base}${isAllowedEmail(user.email) ? "/admin" : "/"}`);
  response.cookies.delete("google_oauth_state");
  return response;
}
