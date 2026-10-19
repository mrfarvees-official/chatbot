import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { embed } from "./embeddings";

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
    const { data, error } = await getSupabaseAdmin().rpc("match_chunks", {
      query_embedding: `[${vector.join(",")}]`,
      query_text: query,
      match_count: topK,
      candidate_count: Math.max(topK * 4, 20),
      rrf_k: 60,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
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
