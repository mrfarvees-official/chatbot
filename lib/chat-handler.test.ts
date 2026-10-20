import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./llm";
import { fillProfileTokens, ndjsonEvent, parseHistoryMessages, parseMessages, preferredToolForQuery, sanitizeTools, selectToolsForQuery } from "./chat-handler";

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
      valid("gmail_read_email"),
      valid("gmail_compose_draft"),
      valid("calendar_search_events"),
      valid("meet_join_meeting"),
    ], true);
    const selected = selectToolsForQuery(tools, [{ role: "user", content: "Search Gmail for messages from account@example.com" }]);
    expect(selected.map((tool) => (tool as { function: { name: string } }).function.name)).toEqual([
      "gmail_search",
      "gmail_read_email",
    ]);
  });

  it("keeps a calendar lookup focused on read tools", () => {
    const tools = sanitizeTools([
      valid("calendar_search_events"),
      valid("calendar_list_events"),
      valid("calendar_read_event"),
      valid("calendar_create_event"),
      valid("calendar_delete_event"),
    ], true);
    const selected = selectToolsForQuery(tools, [{ role: "user", content: "Can you check my calendar if any meetings today found?" }]);
    expect(selected.map((tool) => (tool as { function: { name: string } }).function.name)).toEqual([
      "calendar_search_events",
      "calendar_list_events",
      "calendar_read_event",
    ]);
  });

  it("forces the first direct calendar lookup to the search tool", () => {
    const tools = sanitizeTools([
      valid("calendar_search_events"),
      valid("calendar_list_events"),
      valid("calendar_read_event"),
    ], true);
    expect(preferredToolForQuery(tools, [{ role: "user", content: "Can you check my calendar if any meetings today found?" }])).toBe("calendar_search_events");
    expect(preferredToolForQuery(tools, [
      { role: "user", content: "Can you check my calendar if any meetings today found?" },
      { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function", function: { name: "calendar_search_events", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "1", content: '{"ok":true}' },
    ])).toBeNull();
  });

  it("does not send browser tools for ordinary knowledge questions", () => {
    const tools = sanitizeTools([valid("gmail_search"), valid("meet_join_meeting")], true);
    expect(selectToolsForQuery(tools, [{ role: "user", content: "What technologies are in the portfolio?" }])).toEqual([]);
  });

  it("routes send after send-as-draft to sending, without opening another draft", () => {
    const tools = sanitizeTools([valid("gmail_compose_draft"), valid("gmail_send_current_draft"), valid("calendar_search_events")], true);
    const draftHistory = parseHistoryMessages([
      { role: "user", content: "Check my calendar for meetings today" },
      { role: "assistant", content: "Calendar checked" },
      { role: "user", content: "send as draft" },
      { role: "assistant", content: null, tool_calls: [{ id: "draft-1", type: "function", function: { name: "gmail_compose_draft", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "draft-1", content: '{"ok":true,"note":"Draft opened, NOT sent"}' },
      { role: "assistant", content: "Draft opened, NOT sent" },
    ])!;
    for (const instruction of ["send", "send it", "please send the draft now", "now send it", "send this mail", "send draft", "okay, send it"]) {
      const messages = parseMessages([...draftHistory, { role: "user", content: instruction }])!;
      const selected = selectToolsForQuery(tools, messages);
      expect(selected).toHaveLength(1);
      expect(selected[0]).toMatchObject({ function: { name: "gmail_send_current_draft" } });
      expect(preferredToolForQuery(selected, messages)).toBe("gmail_send_current_draft");
    }
    expect(preferredToolForQuery(tools, parseMessages([...draftHistory, { role: "user", content: "send as draft" }])!)).toBe("gmail_compose_draft");
    expect(preferredToolForQuery(tools, parseMessages([...draftHistory, { role: "user", content: "don't send" }])!)).toBeNull();
  });

  it("does not force an older draft request when no successful draft outcome exists", () => {
    const tools = sanitizeTools([valid("gmail_compose_draft"), valid("gmail_send_current_draft")], true);
    const messages = parseMessages([
      { role: "user", content: "send as draft" },
      { role: "assistant", content: "Could not create draft" },
      { role: "user", content: "send" },
    ])!;
    expect(preferredToolForQuery(tools, messages)).toBeNull();
    expect(preferredToolForQuery(tools, [{ role: "user", content: "send" }])).toBeNull();
    expect(preferredToolForQuery(tools, [{ role: "user", content: "send draft" }])).toBe("gmail_send_current_draft");
    expect(preferredToolForQuery(tools, [{ role: "user", content: "create a new draft" }])).toBe("gmail_compose_draft");
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
  it("explains absent tools and the actual extension approval order", () => {
    expect(buildSystemPrompt([], false)).toContain("No browser tools are available");
    expect(buildSystemPrompt([], false)).toContain("Never print tool-call markup");
    expect(buildSystemPrompt([], true)).toContain("clicking Send manually in Gmail does not trigger an extension approval popup");
  });
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
