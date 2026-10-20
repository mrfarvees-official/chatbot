import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./llm";
import { fillProfileTokens, ndjsonEvent, parseHistoryMessages, parseMessages, sanitizeTools, selectToolsForQuery } from "./chat-handler";

describe("chat validation", () => {
  it("accepts a saved conversation ending with an assistant message", () => {
    expect(parseHistoryMessages([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ])).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
  });

  it("drops leading orphan tool messages and keeps a valid user turn", () => {
    const messages = parseMessages([
      { role: "tool", tool_call_id: "orphan", content: "ignored" },
      { role: "user", content: "Hello" },
    ]);
    expect(messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("rejects an assistant turn as the final message", () => {
    expect(parseMessages([{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }])).toBeNull();
  });

  it("rejects oversized tool arguments", () => {
    expect(parseMessages([
      { role: "user", content: "Do it" },
      { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function", function: { name: "gmail_compose_draft", arguments: "x".repeat(4001) } }] },
      { role: "tool", tool_call_id: "1", content: "ok" },
    ])).toBeNull();
  });
});

describe("tool sanitization", () => {
  const valid = (name: string, description = "safe") => ({
    name,
    description,
    inputSchema: { type: "object", properties: {} },
    risk: "irreversible",
  });

  it("keeps only the default public tools", () => {
    const tools = sanitizeTools([
      valid("gmail_compose_draft"),
      valid("gmail_read_email"),
      valid("generic_click_text"),
    ]);
    expect(tools.map((tool) => (tool as { function: { name: string } }).function.name)).toEqual(["gmail_compose_draft"]);
  });

  it("unlocks Gmail read/write tools only for an authenticated session", () => {
    expect(sanitizeTools([valid("gmail_search")])).toEqual([]);
    expect(
      sanitizeTools([valid("gmail_search"), valid("gmail_delete_email")], true).map(
        (tool) => (tool as { function: { name: string } }).function.name,
      ),
    ).toEqual(["gmail_search", "gmail_delete_email"]);
  });

  it("unlocks Google Meet tools for an authenticated session", () => {
    expect(sanitizeTools([valid("meet_join_meeting")])).toEqual([]);
    expect(
      sanitizeTools([valid("meet_join_meeting"), valid("meet_send_chat")], true).map(
        (tool) => (tool as { function: { name: string } }).function.name,
      ),
    ).toEqual(["meet_join_meeting", "meet_send_chat"]);
  });

  it("drops oversized descriptions", () => {
    expect(sanitizeTools([valid("gmail_compose_draft", "x".repeat(501))])).toEqual([]);
  });

  it("sends only the relevant extension tool family to the model", () => {
    const tools = sanitizeTools([
      valid("gmail_search"),
      valid("gmail_compose_draft"),
      valid("calendar_search_events"),
      valid("meet_join_meeting"),
    ], true);
    const selected = selectToolsForQuery(tools, [{ role: "user", content: "Search Gmail for messages from account@example.com" }]);
    expect(selected.map((tool) => (tool as { function: { name: string } }).function.name)).toEqual([
      "gmail_search",
      "gmail_compose_draft",
    ]);
  });

  it("does not send browser tools for ordinary knowledge questions", () => {
    const tools = sanitizeTools([valid("gmail_search"), valid("meet_join_meeting")], true);
    expect(selectToolsForQuery(tools, [{ role: "user", content: "What technologies are in the portfolio?" }])).toEqual([]);
  });

  it("preserves the Gmail draft schema sent to the model", () => {
    const [tool] = sanitizeTools([
      {
        name: "gmail_compose_draft",
        description: "Open a Gmail draft without sending it.",
        inputSchema: {
          type: "object",
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["to", "subject", "body"],
        },
      },
    ]);
    expect(tool).toMatchObject({
      type: "function",
      function: {
        name: "gmail_compose_draft",
        parameters: {
          required: ["to", "subject", "body"],
        },
      },
    });
  });
});

describe("tool-capable model prompt", () => {
  it("requires explicit email requests to use an available browser tool", () => {
    const prompt = buildSystemPrompt([], true);
    expect(prompt).toContain("call the appropriate email tool");
    expect(prompt).toContain("call the matching Meet tool");
    expect(prompt).toContain("Never invent email addresses");
  });

  it("fills authenticated profile placeholders in tool arguments", () => {
    expect(
      fillProfileTokens(
        { body: "Hello {{full_name}}", phone: "{{mobile_number}}" },
        { full_name: "Ada Lovelace", mobile_number: "+1 555 0100" },
      ),
    ).toEqual({ body: "Hello Ada Lovelace", phone: "+1 555 0100" });
  });
});

describe("NDJSON events", () => {
  it("serializes one newline-delimited JSON event", () => {
    expect(ndjsonEvent({ type: "text", delta: "hello" })).toBe('{"type":"text","delta":"hello"}\n');
  });
});
