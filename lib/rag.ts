import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const DIMENSIONS = 768; // must match vector(768) in your table

function getClients() {
  const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer a server-only secret when one is configured, while supporting the
  // publishable key used by the current local setup.
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const missing = [
    !geminiKey && "NEXT_PUBLIC_GEMINI_API_KEY",
    !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
    !supabaseKey &&
      "SUPABASE_SECRET_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}`);
  }

  if (!geminiKey || !supabaseUrl || !supabaseKey) {
    throw new Error("Required environment variables are not configured");
  }

  return {
    ai: new GoogleGenAI({ apiKey: geminiKey }),
    supabase: createClient(supabaseUrl, supabaseKey),
  };
}

export function chunkText(text: string, size = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size - overlap) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

async function embed(texts: string[], taskType: string): Promise<number[][]> {
  const { ai } = getClients();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: texts.slice(i, i + 100),
      config: { taskType, outputDimensionality: DIMENSIONS },
    });
    out.push(...res.embeddings!.map((e) => e.values!));
  }
  return out;
}

export async function ingest(text: string, source: string) {
  const { supabase } = getClients();
  const chunks = chunkText(text);
  const embeddings = await embed(chunks, "RETRIEVAL_DOCUMENT");

  const rows = chunks.map((content, i) => ({
    content,
    source,
    embedding: embeddings[i],
  }));

  // insert in batches to stay under request size limits
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from("documents")
      .insert(rows.slice(i, i + 100));
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }
  return rows.length;
}

export async function answer(question: string, topK = 4) {
  const { ai, supabase } = getClients();
  const [qEmb] = await embed([question], "RETRIEVAL_QUERY");

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: qEmb,
    match_count: topK,
  });
  if (error) throw new Error(`Search failed: ${error.message}`);
  if (!data || data.length === 0) {
    return { answer: "No documents ingested yet.", sources: [] };
  }

  const context = data
    .map((c: any, i: number) => `[${i + 1}] (${c.source})\n${c.content}`)
    .join("\n\n");

  const prompt = `Answer the question using only the context below. Cite sources like [1].
If the answer isn't in the context, say you don't know.

Context:
${context}

Question: ${question}`;

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  return { answer: res.text, sources: data.map((c: any) => c.source) };
}
