import "server-only";
import OpenAI from "openai";

export const NVIDIA_BASE_URL =
  (process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
export const NVIDIA_CHAT_MODEL =
  process.env.NVIDIA_MODEL ?? "meta/llama-3.1-8b-instruct";
export const NVIDIA_EMBEDDING_MODEL =
  process.env.NVIDIA_EMBEDDING_MODEL ??
  "nvidia/nemotron-3-embed-1b";

export function getNvidiaApiKey() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("Missing environment variable: NVIDIA_API_KEY");
  return apiKey;
}

export function getOpenAIClient() {
  return new OpenAI({
    apiKey: getNvidiaApiKey(),
    baseURL: NVIDIA_BASE_URL,
    maxRetries: 0,
    timeout: 120_000,
  });
}
