"use client";
import { useEffect, useState } from "react";
import { extension } from "@/lib/extension-client";

type Msg = {
  role: string;
  content?: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

export default function AgentPage() {
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [ext, setExt] = useState<"checking" | "ok" | "missing">("checking");

  useEffect(() => {
    extension.ping().then((r) => setExt(r?.ok ? "ok" : "missing"));
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    let h: Msg[] = [...history, { role: "user", content: text }];
    setHistory(h);

    try {
      let finished = false;
      for (let step = 0; step < 8 && !finished; step++) {
        setStatus("Thinking…");
        const tools = await extension.listTools(); // changes as tabs open
        const res = await fetch("/api/admin/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: h, tools }),
        });
        if (res.status === 401) {
          location.href = "/login";
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Agent failed");

        h = [...h, ...data.newMessages];
        setHistory(h);
        if (data.type === "final") {
          finished = true;
          break;
        }

        for (const call of data.calls) {
          setStatus(`Running ${call.name}… (watch for an approval popup)`);
          const out = await extension
            .callTool(call.name, call.args)
            .catch((e) => ({
              ok: false,
              reason: String(e.message ?? e),
            }));
          h = [
            ...h,
            {
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(out).slice(0, 6000),
            },
          ];
          setHistory(h);
        }
      }
      setStatus(finished ? "" : "Stopped after 8 steps.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const visible = history.filter(
    (m) => (m.role === "user" || m.role === "assistant") && m.content,
  );

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <p className="pb-2 text-xs text-neutral-500">
        Extension:{" "}
        {ext === "checking"
          ? "checking…"
          : ext === "ok"
            ? "connected"
            : "not detected (chat only, no browser tools)"}
      </p>
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {visible.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-4 py-2 text-white"
                : "w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-neutral-200 px-4 py-2 text-neutral-900"
            }
          >
            {m.content}
          </div>
        ))}
      </div>
      {status && <p className="pb-2 text-sm text-neutral-600">{status}</p>}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border px-4 py-2"
          placeholder="e.g. Draft an email to Ali about what we found"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          disabled={busy}
        />
        <button
          className="rounded-xl bg-blue-600 px-4 text-white disabled:opacity-40"
          disabled={busy || !input.trim()}
          onClick={send}
        >
          Send
        </button>
      </div>
    </main>
  );
}
