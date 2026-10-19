import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import { chunkText } from "./chunk";
import { embed } from "./embeddings";

export type Visibility = "public" | "private";

export async function ingestDocument(input: {
  title: string;
  source: string;
  visibility: Visibility;
  text: string;
}) {
  const db = getSupabaseAdmin();
  const text = input.text.trim();
  const hash = createHash("sha256")
    .update(`${input.visibility}\n${text}`)
    .digest("hex");

  // Same source already ingested?
  const { data: existing, error: findErr } = await db
    .from("documents")
    .select("id, content_hash")
    .eq("source", input.source);
  if (findErr) throw new Error(findErr.message);
  if (existing?.some((d) => d.content_hash === hash)) {
    return { status: "unchanged" as const };
  }

  // Embed first so a failure here never destroys the old version.
  // The title is prepended for embedding only; stored content stays clean.
  const chunks = chunkText(text);
  const vectors = await embed(
    chunks.map((c) => `${input.title}\n\n${c}`),
    "passage",
  );

  if (existing?.length) {
    const { error } = await db
      .from("documents")
      .delete()
      .eq("source", input.source);
    if (error) throw new Error(error.message);
  }

  const { data: doc, error: docErr } = await db
    .from("documents")
    .insert({
      title: input.title,
      source: input.source,
      visibility: input.visibility,
      content_hash: hash,
    })
    .select("id")
    .single();
  if (docErr) throw new Error(docErr.message);

  const rows = chunks.map((content, i) => ({
    document_id: doc.id,
    chunk_index: i,
    content,
    embedding: vectors[i],
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db.from("chunks").insert(rows.slice(i, i + 100));
    if (error) {
      await db.from("documents").delete().eq("id", doc.id); // cascade removes chunks
      throw new Error(error.message);
    }
  }
  return { status: "ingested" as const, chunks: rows.length };
}
