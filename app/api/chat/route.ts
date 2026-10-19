import { streamReply, type ChatMessage } from "@/lib/llm";
import { retrieve } from "@/lib/retrieval";
import { rateLimit } from "@/lib/rate-limit";

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

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!rateLimit(`chat:${ip}`)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = parseMessages((body as any)?.messages);
  if (!messages) {
    return Response.json({ error: "Invalid messages" }, { status: 400 });
  }

  // Public route: scope is hardcoded. Never read it from the request.
  const sources = await retrieve(messages[messages.length - 1].content, "public");

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