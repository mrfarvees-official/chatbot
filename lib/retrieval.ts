import "server-only";
import { embed } from "./embeddings";
import { db, sql } from "./local-db";

export type Source = {
  title: string;
  source?: string;
  content: string;
  similarity?: number;
  score?: number;
};

export async function retrieve(query: string, topK = 6): Promise<Source[]> {
  try {
    const [vector] = await embed([query], "query");
    const rows = db.all(sql`select c.content, c.embedding, d.title, d.source from chunks c join documents d on d.id = c.document_id`) as Array<{ content: string; embedding: string; title: string; source: string }>;
    const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
    const scored = rows.map((row) => {
      const embedding = JSON.parse(row.embedding) as number[];
      let dot = 0; let left = 0; let right = 0;
      for (let i = 0; i < Math.min(vector.length, embedding.length); i++) { dot += vector[i] * embedding[i]; left += vector[i] ** 2; right += embedding[i] ** 2; }
      const similarity = dot / (Math.sqrt(left) * Math.sqrt(right) || 1);
      const lexical = terms.reduce((count, term) => count + (row.content.toLowerCase().includes(term) ? 1 : 0), 0);
      return { ...row, similarity, score: similarity + lexical / Math.max(terms.length, 1) };
    }).sort((a, b) => b.score - a.score).slice(0, topK);
    const minimum = Number(process.env.RAG_MIN_SIMILARITY ?? "0");
    const filtered = scored.filter((row) => minimum <= 0 || row.similarity >= minimum);
    if (process.env.NEXT_PUBLIC_EXTENSION_DEBUG_LOGGING === "true") {
      console.info("[retrieval] results", {
        count: filtered.length,
        dropped: scored.length - filtered.length,
      });
    }
    return filtered.map((row) => ({
      title: row.title,
      source: row.source ?? undefined,
      content: row.content,
      similarity: row.similarity,
      score: row.score,
    }));
  } catch (error) {
    console.error("Retrieval failed:", error);
    return [];
  }
}
