import { createClient } from "@supabase/supabase-js";
import {
  getOpenAIClient,
  getNvidiaApiKey,
  NVIDIA_BASE_URL,
  NVIDIA_CHAT_MODEL,
  NVIDIA_EMBEDDING_MODEL,
} from "./openai";

const DIMENSIONS = 2048; // must match vector(2048) in your table

function getClients() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const missing = [
    !supabaseUrl && "SUPABASE_URL",
    !supabaseKey && "SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}`);
  }
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Required environment variables are not configured");
  }

  return {
    ai: getOpenAIClient(),
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

async function embed(texts: string[], inputType: "passage" | "query") {
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += 100) {
    const response = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getNvidiaApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_EMBEDDING_MODEL,
        input: texts.slice(i, i + 100),
        input_type: inputType,
        modality: "text",
        dimensions: DIMENSIONS,
        encoding_format: "float",
      }),
    });
    if (!response.ok) {
      throw new Error(`Embedding request failed (${response.status}): ${await response.text()}`);
    }
    const res = (await response.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
    };
    out.push(
      ...res.data.sort((a, b) => a.index - b.index).map((embedding) => embedding.embedding),
    );
  }
  return out;
}

export async function ingest(text: string, source: string) {
  const { supabase } = getClients();
  const chunks = chunkText(text);
  const embeddings = await embed(chunks, "passage");
  const rows = chunks.map((content, i) => ({ content, source, embedding: embeddings[i] }));

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from("documents").insert(rows.slice(i, i + 100));
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }
  return rows.length;
}

export async function answer(question: string, topK = 4) {
  const { ai, supabase } = getClients();
  const [qEmb] = await embed([question], "query");
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: qEmb,
    match_count: topK,
  });
  if (error) throw new Error(`Search failed: ${error.message}`);
  if (!data || data.length === 0) {
    return { answer: "No documents ingested yet.", sources: [] };
  }

  const context = data
    .map((c: { source: string; content: string }, i: number) =>
      `[${i + 1}] (${c.source})\n${c.content}`,
    )
    .join("\n\n");
  const prompt = `Answer the question using only the context below. Cite sources like [1].
If the answer isn't in the context, say you don't know.

Context:
${context}

Question: ${question}`;
  const res = await ai.chat.completions.create({
    model: NVIDIA_CHAT_MODEL,
    messages: [{ role: "user", content: prompt }],
  });

  return {
    answer: res.choices[0]?.message?.content ?? "",
    sources: data.map((c: { source: string }) => c.source),
  };
}
