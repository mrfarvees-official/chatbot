import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./local-db";

const COOKIE = "chatbot_session";
const SESSION_DAYS = 30;

export type LocalUser = { id: string; email: string; email_confirmed_at: string };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  db.run(sql`insert into sessions (token_hash, user_id, expires_at) values (${hashToken(token)}, ${userId}, ${expires})`);
  const store = await cookies();
  store.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86_400 });
}

export async function clearSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) db.run(sql`delete from sessions where token_hash = ${hashToken(token)}`);
  store.delete(COOKIE);
}

export async function getLocalUser(): Promise<LocalUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db.get<{ id: string; email: string; expires_at: number }>(sql`
    select u.id, u.email, s.expires_at from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)}
  `);
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, email: row.email, email_confirmed_at: new Date().toISOString() };
}

export function isAllowedEmail(email: string) {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).includes(normalizeEmail(email));
}

export function upsertUser(input: { email: string; provider: string; passwordHash?: string | null }) {
  const email = normalizeEmail(input.email);
  const existing = db.get<{ id: string }>(sql`select id from users where email = ${email}`);
  const id = existing?.id ?? randomUUID();
  db.run(existing
    ? sql`update users set provider = ${input.provider}, password_hash = coalesce(${input.passwordHash ?? null}, password_hash), email_verified = 1 where id = ${id}`
    : sql`insert into users (id, email, password_hash, provider, email_verified, created_at) values (${id}, ${email}, ${input.passwordHash ?? null}, ${input.provider}, 1, ${new Date().toISOString()})`);
  db.run(sql`insert or ignore into profiles (user_id, updated_at) values (${id}, ${new Date().toISOString()})`);
  return { id, email };
}

export { COOKIE };
