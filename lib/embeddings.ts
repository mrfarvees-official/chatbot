import "server-only";
import {
  getNvidiaApiKey,
  NVIDIA_BASE_URL,
  NVIDIA_EMBEDDING_MODEL,
} from "./openai";

// Required by nvidia/nemotron-3-embed-1b; this must match vector(2048) in SQL.
export const EMBEDDING_DIMENSIONS = 2048;
const BATCH = 32;

export async function embed(texts: string[], inputType: "passage" | "query") {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const input = texts.slice(i, i + BATCH);
    const res = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getNvidiaApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_EMBEDDING_MODEL,
        input,
        input_type: inputType,
        modality: "text",
        dimensions: EMBEDDING_DIMENSIONS,
        embedding_type: "float",
        encoding_format: "float",
        truncate: "END",
      }),
    });
    if (!res.ok) {
      throw new Error(`Embedding failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
    };
    out.push(
      ...json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
    );
  }
  return out;
}
