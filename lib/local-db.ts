import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";

const filename = resolve(/* turbopackIgnore: true */ process.env.LOCAL_DB_PATH ?? ".data/chatbot.sqlite");
mkdirSync(dirname(filename), { recursive: true });

const sqlite = new Database(filename);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.exec(`
  create table if not exists users (
    id text primary key not null,
    email text not null unique,
    password_hash text,
    provider text not null default 'local',
    email_verified integer not null default 1,
    created_at text not null
  );
  create table if not exists sessions (
    token_hash text primary key not null,
    user_id text not null references users(id) on delete cascade,
    expires_at integer not null
  );
  create table if not exists profiles (
    user_id text primary key not null references users(id) on delete cascade,
    first_name text,
    last_name text,
    full_name text,
    mobile_number text,
    updated_at text not null
  );
  create table if not exists documents (
    id text primary key not null,
    title text not null,
    source text not null unique,
    content_hash text not null,
    updated_at text not null
  );
  create table if not exists chunks (
    id integer primary key autoincrement,
    document_id text not null references documents(id) on delete cascade,
    chunk_index integer not null,
    content text not null,
    embedding text not null
  );
  create index if not exists chunks_document_id_idx on chunks(document_id);
`);

export const db = drizzle(sqlite);
export { sqlite, sql };
