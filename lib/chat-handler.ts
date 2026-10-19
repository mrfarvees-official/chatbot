import "server-only";
import { streamReply, type ChatMessage } from "./llm";
import { retrieve, type Scope } from "./retrieval";
import { rateLimit } from "./rate-limit";

const MAX_MESSAGES = 10;
const MAX_CHARS = 2000;

function parseMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: ChatMessage[] = [];
  for (const m of input.slice(-MAX_MESSAGES)) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      !m.content.trim()
    )
      return null;
    out.push({ role: m.role, content: m.content.slice(0, MAX_CHARS) });
  }
  return out[out.length - 1].role === "user" ? out : null;
}

export async function handleChat(req: Request, scope: Scope) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!rateLimit(`chat:${scope}:${ip}`, scope === "admin" ? 60 : 15)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const messages = parseMessages(body?.messages);
  if (!messages)
    return Response.json({ error: "Invalid messages" }, { status: 400 });

  // scope comes from the calling route, never from the request body
  const sources = await retrieve(messages[messages.length - 1].content, scope);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const text of streamReply(messages, sources)) {
          controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        console.error("Chat stream failed:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
