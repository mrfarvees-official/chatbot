import "server-only";
import {
  createModelStream,
  type ChatMessage,
  type ModelTool,
  type ToolCall,
} from "./llm";
import { retrieve } from "./retrieval";
import { rateLimit } from "./rate-limit";

const MAX_MESSAGES = 30;
const MAX_USER_CHARS = 2000;
const MAX_TOOL_CHARS = 6000;
const MAX_ARGUMENT_CHARS = 4000;
const MAX_TOOL_MESSAGES = 12;
const NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const DEFAULT_TOOLS = new Set([
  "gmail_compose_draft",
  "gmail_send_current_draft",
  "calendar_create_event",
  "calendar_compose_invite_email",
  "meet_schedule_meeting",
  "meet_compose_invite_email",
]);

type ToolCallInput = {
  id: unknown;
  type?: unknown;
  function?: { name?: unknown; arguments?: unknown };
};

function configuredTools() {
  const raw = process.env.PUBLIC_TOOL_ALLOWLIST?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return new Set(
    (raw?.length ? raw : [...DEFAULT_TOOLS]).filter((name) =>
      DEFAULT_TOOLS.has(name),
    ),
  );
}

function invalid(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function parseMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const source = input.slice(-MAX_MESSAGES);
  const out: ChatMessage[] = [];
  let toolMessages = 0;
  for (const message of source) {
    if (!message || typeof message !== "object") return null;
    const m = message as Record<string, unknown>;
    if (m.role === "user") {
      if (typeof m.content !== "string" || !m.content.trim()) return null;
      out.push({ role: "user", content: m.content.slice(0, MAX_USER_CHARS) });
    } else if (m.role === "assistant") {
      if (m.content !== null && typeof m.content !== "string") return null;
      const calls = m.tool_calls;
      const parsed: ToolCall[] = [];
      if (calls !== undefined) {
        if (!Array.isArray(calls)) return null;
        for (const call of calls as ToolCallInput[]) {
          if (
            typeof call?.id !== "string" ||
            call.type !== "function" ||
            typeof call.function?.name !== "string" ||
            typeof call.function.arguments !== "string" ||
            call.function.arguments.length > MAX_ARGUMENT_CHARS
          )
            return null;
          parsed.push({
            id: call.id,
            type: "function",
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          });
        }
      }
      out.push({
        role: "assistant",
        content: typeof m.content === "string" ? m.content : null,
        ...(parsed.length ? { tool_calls: parsed } : {}),
      });
    } else if (m.role === "tool") {
      toolMessages++;
      if (
        typeof m.tool_call_id !== "string" ||
        typeof m.content !== "string" ||
        m.content.length > MAX_TOOL_CHARS
      )
        return null;
      out.push({
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: m.content,
      });
    } else return null;
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (toolMessages > MAX_TOOL_MESSAGES || !out.length) return null;
  const last = out[out.length - 1];
  return last.role === "user" || last.role === "tool" ? out : null;
}

function sanitizeTools(input: unknown): ModelTool[] {
  if (!Array.isArray(input)) return [];
  const allowed = configuredTools();
  const result: ModelTool[] = [];
  for (const item of input.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const name = t.name;
    const description = t.description;
    const schema = t.inputSchema;
    if (
      typeof name !== "string" ||
      !NAME.test(name) ||
      !allowed.has(name) ||
      typeof description !== "string" ||
      description.length > 500 ||
      !schema ||
      typeof schema !== "object" ||
      Array.isArray(schema) ||
      JSON.stringify(schema).length > 4096
    )
      continue;
    result.push({
      type: "function",
      function: {
        name,
        description,
        parameters: schema as Record<string, unknown>,
      },
    });
  }
  return result;
}

function event(value: unknown) {
  return `${JSON.stringify(value)}\n`;
}

function queryFor(messages: ChatMessage[]) {
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  if (!latestUser || latestUser.role !== "user") return "";
  if (latestUser.content.length >= 40) return latestUser.content;
  const users = messages.filter((m): m is Extract<ChatMessage, { role: "user" }> => m.role === "user");
  const previous = users.at(-2)?.content;
  return previous ? `${previous}\n${latestUser.content}` : latestUser.content;
}

function ndjsonStream(
  messages: ChatMessage[],
  sources: Awaited<ReturnType<typeof retrieve>>,
  tools: ModelTool[],
  signal: AbortSignal,
) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const write = (value: unknown) => controller.enqueue(encoder.encode(event(value)));
      try {
        const stream = await createModelStream(messages, sources, tools, signal);
        let content = "";
        const calls = new Map<number, ToolCall>();
        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          const delta = choice?.delta;
          if (delta?.content) {
            content += delta.content;
            write({ type: "text", delta: delta.content });
          }
          for (const deltaCall of delta?.tool_calls ?? []) {
            const index = deltaCall.index;
            const current = calls.get(index) ?? {
              id: "",
              type: "function" as const,
              function: { name: "", arguments: "" },
            };
            current.id += deltaCall.id ?? "";
            current.function.name += deltaCall.function?.name ?? "";
            current.function.arguments += deltaCall.function?.arguments ?? "";
            calls.set(index, current);
          }
        }
        const toolCalls = [...calls.values()];
        const assistant = {
          role: "assistant" as const,
          content: content || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        };
        write({ type: "assistant_message", message: assistant });
        if (toolCalls.length) {
          const parsed = [];
          for (const call of toolCalls) {
            if (!call.id || !NAME.test(call.function.name) || call.function.arguments.length > MAX_ARGUMENT_CHARS) {
              write({ type: "error", message: "The assistant produced an invalid action. Please try again." });
              write({ type: "done" });
              controller.close();
              return;
            }
            try {
              parsed.push({ id: call.id, name: call.function.name, args: JSON.parse(call.function.arguments) });
            } catch {
              write({ type: "error", message: "The assistant produced an invalid action. Please try again." });
              write({ type: "done" });
              controller.close();
              return;
            }
          }
          write({ type: "tool_calls", calls: parsed });
        }
        write({ type: "done" });
        controller.close();
      } catch (error) {
        if (signal.aborted) {
          controller.close();
          return;
        }
        console.error("Chat stream failed:", error);
        write({ type: "error", message: "Something went wrong." });
        write({ type: "done" });
        controller.close();
      }
    },
  });
}

export async function handleChat(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!rateLimit(`chat:${ip}`, 30) || !rateLimit(`chat-daily:${ip}`, 300, 86_400_000)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const messages = parseMessages(body?.messages);
  if (!messages) return invalid("Invalid messages");
  const tools = sanitizeTools(body?.tools);
  const sources = await retrieve(queryFor(messages));
  return new Response(ndjsonStream(messages, sources, tools, req.signal), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
