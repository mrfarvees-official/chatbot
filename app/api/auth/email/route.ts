import { NextResponse } from "next/server";
import { db, sql } from "@/lib/local-db";
import { createSession, normalizeEmail, passwordHash, upsertUser, verifyPassword } from "@/lib/local-auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { email?: unknown; password?: unknown; mode?: unknown } | null;
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const mode = body?.mode === "signup" ? "signup" : "signin";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return Response.json({ error: "Enter a valid email and a password with at least 8 characters." }, { status: 400 });
  }
  const row = db.get<{ id: string; password_hash: string | null }>(sql`select id, password_hash from users where email = ${email}`);
  if (mode === "signup") {
    if (row) return Response.json({ error: "An account already exists for this email." }, { status: 409 });
    const user = upsertUser({ email, provider: "local", passwordHash: passwordHash(password) });
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  }
  if (!row?.password_hash || !verifyPassword(password, row.password_hash)) {
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }
  await createSession(row.id);
  return NextResponse.json({ ok: true });
}
