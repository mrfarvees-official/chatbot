import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import Database from "better-sqlite3";
import process from "node:process";

const [emailArg, passwordArg] = process.argv.slice(2);
const email = (emailArg ?? "").trim().toLowerCase();
const password = passwordArg ?? "";
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
  console.error("Usage: node scripts/create-admin.mjs owner@example.com 'password-at-least-8'");
  process.exit(1);
}
const file = process.env.LOCAL_DB_PATH ?? ".data/chatbot.sqlite";
const db = new Database(file);
db.exec(`
  create table if not exists users (id text primary key not null, email text not null unique, password_hash text, provider text not null default 'local', email_verified integer not null default 1, is_admin integer not null default 0, created_at text not null);
  create table if not exists profiles (user_id text primary key not null, first_name text, last_name text, full_name text, mobile_number text, updated_at text not null);
`);
const salt = randomBytes(16).toString("hex");
const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const existing = db.prepare("select id from users where email = ?").get(email);
const id = existing?.id ?? randomUUID();
if (existing) {
  db.prepare("update users set password_hash = ?, is_admin = 1, email_verified = 1 where id = ?").run(passwordHash, id);
} else {
  db.prepare("insert into users (id, email, password_hash, provider, email_verified, is_admin, created_at) values (?, ?, ?, 'local', 1, 1, ?)").run(id, email, passwordHash, new Date().toISOString());
}
db.prepare("insert or ignore into profiles (user_id, updated_at) values (?, ?)").run(id, new Date().toISOString());
console.log(`Admin account created: ${email}`);
