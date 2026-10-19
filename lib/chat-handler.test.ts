import { describe, expect, it } from "vitest";
import { ndjsonEvent, parseMessages, sanitizeTools } from "./chat-handler";

describe("chat validation", () => {
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

  it("drops oversized descriptions", () => {
    expect(sanitizeTools([valid("gmail_compose_draft", "x".repeat(501))])).toEqual([]);
  });
});

describe("NDJSON events", () => {
  it("serializes one newline-delimited JSON event", () => {
    expect(ndjsonEvent({ type: "text", delta: "hello" })).toBe('{"type":"text","delta":"hello"}\n');
  });
});
