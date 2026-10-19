import "server-only";
import { createHash } from "node:crypto";
import { chunkText } from "./chunk";
import { embed } from "./embeddings";
import { db, sqlite, sql } from "./local-db";
import { randomUUID } from "node:crypto";

export async function ingestDocument(input: {
  title: string;
  source: string;
  text: string;
}) {
  const text = input.text.trim();
  const hash = createHash("sha256").update(text).digest("hex");

  // Same source already ingested?
  const existing = db.get<{ id: string; content_hash: string }>(sql`select id, content_hash from documents where source = ${input.source}`);
  if (existing?.content_hash === hash) {
    return { status: "unchanged" as const };
  }

  // Embed first so a failure here never destroys the old version.
  // The title is prepended for embedding only; stored content stays clean.
  const chunks = chunkText(text);
  const vectors = await embed(
    chunks.map((c) => `${input.title}\n\n${c}`),
    "passage",
  );

  db.run(sql`delete from documents where source = ${input.source}`);
  const id = randomUUID();
  db.run(sql`insert into documents (id, title, source, content_hash, updated_at) values (${id}, ${input.title}, ${input.source}, ${hash}, ${new Date().toISOString()})`);

  const rows = chunks.map((content, i) => ({
    document_id: id,
    chunk_index: i,
    content,
    embedding: vectors[i],
  }));
  const insert = sqlite.transaction((items: typeof rows) => {
    for (const row of items) sqlite.prepare("insert into chunks (document_id, chunk_index, content, embedding) values (?, ?, ?, ?)").run(row.document_id, row.chunk_index, row.content, JSON.stringify(row.embedding));
  });
  insert(rows);
  return { status: "ingested" as const, chunks: rows.length };
}
