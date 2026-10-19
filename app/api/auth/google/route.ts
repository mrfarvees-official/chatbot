import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL("/login?error=google_config", req.url));
  const state = crypto.randomUUID();
  const callback = new URL("/api/auth/callback", req.url).toString();
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code", scope: "openid email profile", state, access_type: "online", prompt: "select_account" });
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  response.cookies.set("google_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return response;
}
