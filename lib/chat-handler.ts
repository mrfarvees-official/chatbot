import "server-only";
import {
  createModelStream,
  type ChatMessage,
  type ModelTool,
  type ToolCall,
  type VisitorProfile,
} from "./llm";
import { getLocalUser } from "./local-auth";
import { db, sql } from "./local-db";
import { getChatMessages, replaceChatMessages } from "./chat-history";
import { retrieve } from "./retrieval";
import { rateLimit } from "./rate-limit";

const MAX_MESSAGES = 30;
const MAX_USER_CHARS = 2000;
const MAX_TOOL_CHARS = 6000;
const MAX_ARGUMENT_CHARS = 4000;
const MAX_TOOL_MESSAGES = 12;
const MAX_MODEL_TOOLS = 64;
const NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const DEFAULT_TOOLS = new Set([
  "gmail_compose_draft",
  "gmail_send_current_draft",
  "calendar_create_event",
  "calendar_compose_invite_email",
  "meet_schedule_meeting",
  "meet_compose_invite_email",
]);
const AUTHENTICATED_GMAIL_TOOLS = new Set([
  "calendar_search_events",
  "calendar_list_events",
  "calendar_read_event",
  "calendar_update_event",
  "calendar_delete_event",
  "calendar_rsvp",
  "calendar_add_guests",
  "calendar_open_availability",
  "gmail_find_meeting_links",
  "gmail_search",
  "gmail_read_email",
  "gmail_reply_draft",
  "gmail_forward_draft",
  "gmail_archive_email",
  "gmail_delete_email",
  "gmail_mark_email",
  "gmail_modify_labels",
  "gmail_list_attachments",
  "gmail_open_attachment",
  "meet_join_meeting",
  "meet_join_link",
  "meet_toggle_mic",
  "meet_toggle_camera",
  "meet_share_screen",
  "meet_leave_call",
  "meet_list_participants",
  "meet_manage_participant",
  "meet_read_chat",
  "meet_send_chat",
  "meet_toggle_captions",
  "meet_read_captions",
  "meet_toggle_recording",
  "meet_raise_hand",
  "meet_send_reaction",
  "meet_get_summary",
]);
const AUTHENTICATED_MEET_TOOLS = new Set([
  "meet_join_meeting",
  "meet_join_link",
  "meet_start_meeting",
  "meet_toggle_mic",
  "meet_toggle_camera",
  "meet_share_screen",
  "meet_leave_call",
  "meet_list_participants",
  "meet_manage_participant",
  "meet_read_chat",
  "meet_send_chat",
  "meet_toggle_captions",
  "meet_read_captions",
  "meet_toggle_recording",
  "meet_raise_hand",
  "meet_send_reaction",
  "meet_get_summary",
]);

type ToolCallInput = {
  id: unknown;
  type?: unknown;
  function?: { name?: unknown; arguments?: unknown };
};

function configuredTools(authenticated: boolean) {
  const raw = (authenticated
    ? process.env.AUTHENTICATED_TOOL_ALLOWLIST
    : process.env.PUBLIC_TOOL_ALLOWLIST
  )?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const allowed = new Set(authenticated ? [...DEFAULT_TOOLS, ...AUTHENTICATED_GMAIL_TOOLS] : DEFAULT_TOOLS);
  const selected = raw?.length ? new Set(raw) : allowed;
  // Keep the Meet catalog available to authenticated users even when an older
  // AUTHENTICATED_TOOL_ALLOWLIST only lists the original Gmail tools.
  if (authenticated) {
    for (const name of AUTHENTICATED_MEET_TOOLS) selected.add(name);
  }
  return new Set([...selected].filter((name) => allowed.has(name) || AUTHENTICATED_MEET_TOOLS.has(name)));
}

function invalid(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function parseMessages(input: unknown): ChatMessage[] | null {
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

export function parseHistoryMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const validated = parseMessages([
    ...input,
    { role: "user", content: "__history_validation__" },
  ]);
  return validated ? validated.slice(0, -1) : null;
}

export function sanitizeTools(input: unknown, authenticated = false): ModelTool[] {
  if (!Array.isArray(input)) return [];
  const allowed = configuredTools(authenticated);
  const result: ModelTool[] = [];
  for (const item of input.slice(0, MAX_MODEL_TOOLS)) {
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

export function selectToolsForQuery(tools: ModelTool[], messages: ChatMessage[]): ModelTool[] {
  const query = queryFor(messages).toLowerCase();
  const wantsGmail = /\b(gmail|email|e-mail|mail|inbox|message|attachment|draft|recipient|sender)\b/.test(query);
  const wantsCalendar = /\b(calendar|schedule|scheduling|availability|event|appointment|invite|booking|book|meeting)\b/.test(query);
  const wantsMeet = /\b(google\s+meet|meet link|join (the )?(current )?meet|video\s+call|join\s+call|microphone|camera|screen share)\b/.test(query);
  const selected = new Set<string>();
  const add = (...names: string[]) => names.forEach((name) => selected.add(name));

  if (wantsGmail) {
    if (/\b(search|find|check|show|read|open|latest|inbox|message|attachment|sender|from)\b/.test(query)) {
      add("gmail_search", "gmail_read_email");
      if (/\battachment/.test(query)) add("gmail_list_attachments", "gmail_open_attachment");
    }
    if (/\b(draft|compose|send|reply|forward|archive|delete|label|mark)\b/.test(query)) {
      if (/\b(reply|forward)\b/.test(query)) add("gmail_reply_draft", "gmail_forward_draft");
      else add("gmail_compose_draft", "gmail_send_current_draft");
    }
    if (/\b(meeting|calendar)\b/.test(query)) add("gmail_find_meeting_links");
  }

  if (wantsCalendar) {
    if (/\b(check|find|show|list|search|today|tomorrow|upcoming|meeting|event|read)\b/.test(query)) {
      add("calendar_search_events", "calendar_list_events", "calendar_read_event");
    }
    if (/\b(create|schedule|book|set up|add)\b/.test(query)) add("calendar_create_event");
    if (/\b(update|change|reschedule|edit)\b/.test(query)) add("calendar_update_event");
    if (/\b(delete|cancel|remove)\b/.test(query)) add("calendar_delete_event");
    if (/\brsvp\b|\baccept\b|\bdecline\b/.test(query)) add("calendar_rsvp");
    if (/\bguest|attendee|invite/.test(query)) add("calendar_add_guests", "calendar_compose_invite_email");
    if (/\bavailability|free|open time|slot/.test(query)) add("calendar_open_availability");
  }

  if (wantsMeet) {
    if (/\bjoin\b/.test(query)) add("meet_join_meeting", "meet_join_link");
    if (/\bstart|schedule/.test(query)) add("meet_start_meeting", "meet_schedule_meeting");
    if (/\bmicrophone|mic/.test(query)) add("meet_toggle_mic");
    if (/\bcamera|video/.test(query)) add("meet_toggle_camera");
    if (/\bscreen share|share screen/.test(query)) add("meet_share_screen");
    if (/\bleave\b/.test(query)) add("meet_leave_call");
    if (/\bparticipant/.test(query)) add("meet_list_participants", "meet_manage_participant");
    if (/\bchat|message/.test(query)) add("meet_read_chat", "meet_send_chat");
    if (/\bcaption/.test(query)) add("meet_toggle_captions", "meet_read_captions");
    if (/\brecord/.test(query)) add("meet_toggle_recording");
    if (/\braise hand|reaction/.test(query)) add("meet_raise_hand", "meet_send_reaction");
    if (/\bsummary/.test(query)) add("meet_get_summary");
    if (/\binvite|email/.test(query)) add("meet_compose_invite_email");
  }

  return tools.filter((tool) => tool.type === "function" && selected.has(tool.function.name));
}

export function preferredToolForQuery(tools: ModelTool[], messages: ChatMessage[]): string | null {
  const last = messages.at(-1);
  if (!last || last.role !== "user") return null;
  const query = queryFor(messages).toLowerCase();
  const available = new Set(tools.map((tool) => tool.type === "function" ? tool.function.name : ""));
  const choose = (name: string) => available.has(name) ? name : null;
  if (/\b(calendar|schedule|availability|event|appointment|meeting)\b/.test(query) &&
      /\b(check|find|show|list|search|today|tomorrow|upcoming|meeting|event|read)\b/.test(query)) {
    return choose("calendar_search_events");
  }
  if (/\b(gmail|email|e-mail|mail|inbox|message)\b/.test(query) &&
      /\b(search|find|check|show|read|open|latest|inbox|message|sender|from)\b/.test(query)) {
    return choose("gmail_search");
  }
  if (/\b(draft|compose)\b/.test(query)) return choose("gmail_compose_draft");
  if (/\b(join|start)\b/.test(query) && /\b(meet|meeting|call)\b/.test(query)) {
    return choose(query.includes("join") ? "meet_join_meeting" : "meet_start_meeting");
  }
  return null;
}

export function ndjsonEvent(value: unknown) {
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

function sameMessage(left: ChatMessage, right: ChatMessage) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sessionContext(sessionMessages: ChatMessage[], requestMessages: ChatMessage[]) {
  const hasStoredPrefix = sessionMessages.length <= requestMessages.length &&
    sessionMessages.every((message, index) => sameMessage(message, requestMessages[index]));
  return hasStoredPrefix ? requestMessages : [...sessionMessages, ...requestMessages];
}

export function fillProfileTokens(value: unknown, profile?: VisitorProfile | null): unknown {
  if (!profile) return value;
  if (typeof value === "string") {
    return value.replace(/\{\{\s*(first_name|last_name|full_name|mobile_number)\s*\}\}/g, (_, key) =>
      String(profile[key as keyof VisitorProfile] ?? ""),
    );
  }
  if (Array.isArray(value)) return value.map((item) => fillProfileTokens(item, profile));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fillProfileTokens(item, profile)]),
    );
  }
  return value;
}

function ndjsonStream(
  messages: ChatMessage[],
  sources: Awaited<ReturnType<typeof retrieve>>,
  tools: ModelTool[],
  signal: AbortSignal,
  profile?: VisitorProfile | null,
  history?: { userId: string; sessionId: string },
) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const write = (value: unknown) => controller.enqueue(encoder.encode(ndjsonEvent(value)));
      try {
        const preferred = preferredToolForQuery(tools, messages);
        const stream = await createModelStream(
          messages,
          sources,
          tools,
          signal,
          profile,
          preferred ? { type: "function", function: { name: preferred } } : "auto",
        );
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
        if (toolCalls.length) {
          const parsed: { id: string; name: string; args: unknown }[] = [];
          for (const call of toolCalls) {
            if (!call.id || !NAME.test(call.function.name) || call.function.arguments.length > MAX_ARGUMENT_CHARS) {
              write({ type: "error", message: "The assistant produced an invalid action. Please try again." });
              write({ type: "done" });
              controller.close();
              return;
            }
            try {
              parsed.push({
                id: call.id,
                name: call.function.name,
                args: fillProfileTokens(JSON.parse(call.function.arguments), profile),
              });
            } catch {
              write({ type: "error", message: "The assistant produced an invalid action. Please try again." });
              write({ type: "done" });
              controller.close();
              return;
            }
          }
          const assistant = {
            role: "assistant" as const,
            content: content || null,
            tool_calls: toolCalls.map((call, index) => ({
              ...call,
              function: {
                ...call.function,
                arguments: JSON.stringify(parsed[index].args),
              },
            })),
          };
          if (history) {
            try {
              replaceChatMessages(history.userId, history.sessionId, [...messages, assistant]);
            } catch {
              console.error("Chat history response save failed");
            }
          }
          write({ type: "assistant_message", message: assistant });
          write({ type: "tool_calls", calls: parsed });
        } else {
          const assistant = { role: "assistant" as const, content: content || null };
          if (history) {
            try {
              replaceChatMessages(history.userId, history.sessionId, [...messages, assistant]);
            } catch {
              console.error("Chat history response save failed");
            }
          }
          write({ type: "assistant_message", message: assistant });
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
  let user: { id: string; email?: string; email_confirmed_at?: string | null } | null = null;
  let profile: VisitorProfile | null = null;
  try {
    user = await getLocalUser();
    if (user) {
      profile = db.get(sql`select first_name, last_name, full_name, mobile_number from profiles where user_id = ${user.id}`) as VisitorProfile | null;
    }
  } catch (error) {
    console.error("Chat auth lookup failed:", error);
  }
  if (!user?.email || !user.email_confirmed_at) return Response.json({ error: "Authentication required" }, { status: 401 });
  const authenticated = true;
  const authenticatedUser = user;
  const suppliedTools = sanitizeTools(body?.tools, authenticated);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
  let contextMessages = messages;
  if (sessionId) {
    const stored = getChatMessages(authenticatedUser.id, sessionId);
    if (!stored) return Response.json({ error: "Chat session not found" }, { status: 404 });
    const storedMessages = stored.map((message) =>
      Object.fromEntries(Object.entries(message).filter(([key]) => key !== "createdAt")) as ChatMessage,
    );
    contextMessages = sessionContext(storedMessages, messages);
    const validatedContext = parseMessages(contextMessages);
    if (!validatedContext) return invalid("Invalid chat history");
    contextMessages = validatedContext;
  }
  const tools = selectToolsForQuery(suppliedTools, contextMessages);
  if (process.env.NEXT_PUBLIC_EXTENSION_DEBUG_LOGGING === "true") {
    console.debug("[chat] tools", {
      count: tools.length,
      supplied: suppliedTools.length,
      names: tools.map((tool) =>
        tool.type === "function" ? tool.function.name : "custom",
      ),
    });
  }
  const sources = await retrieve(queryFor(contextMessages));
  return new Response(ndjsonStream(contextMessages, sources, tools, req.signal, profile, sessionId ? { userId: authenticatedUser.id, sessionId } : undefined), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
