import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("./openai", () => ({
  NVIDIA_CHAT_MODEL: "test-model",
  getOpenAIClient: () => ({ chat: { completions: { create } } }),
}));

import { createModelStream } from "./llm";

describe("model tool request contract", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({});
  });

  it("sends the Gmail tool and enables automatic tool choice", async () => {
    const tool = {
      type: "function" as const,
      function: {
        name: "gmail_compose_draft",
        description: "Open a prefilled Gmail draft without sending it.",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["to", "subject", "body"],
        },
      },
    };

    await createModelStream(
      [{ role: "user", content: "Email the owner about leave." }],
      [],
      [tool],
      new AbortController().signal,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        stream: true,
        tool_choice: "auto",
        tools: [tool],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
