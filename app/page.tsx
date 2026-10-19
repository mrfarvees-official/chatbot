"use client";

import { useEffect, useRef, useState } from "react";
import { extension } from "@/lib/extension-client";

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type Msg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type Tool = { name: string; description: string; inputSchema: object };
type ToolCallResult = { id: string; name: string; args: unknown };

const installUrl = process.env.NEXT_PUBLIC_EXTENSION_URL;

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [extensionState, setExtensionState] = useState<"checking" | "connected" | "missing">("checking");
  const [extensionVersion, setExtensionVersion] = useState("");
  const [auth, setAuth] = useState<{ status: "checking" | "signed_in" | "signed_out"; email?: string }>({ status: "checking" });
  const [streaming, setStreaming] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    extension.ping().then((result) => {
      if (result?.ok) {
        setExtensionState("connected");
        setExtensionVersion(result.version ?? "");
      } else setExtensionState("missing");
    });
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => setAuth(data?.authenticated ? { status: "signed_in", email: data.email } : { status: "signed_out" }))
      .catch(() => setAuth({ status: "signed_out" }));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, status]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    setStatus("");
    setStreaming("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let working: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(working);

    try {
      let completed = false;
      for (let round = 0; round < 6 && !completed; round++) {
        const tools = (await extension.listTools()).filter(
          (tool): tool is Tool => Boolean(tool && typeof tool === "object"),
        );
        if (tools.length && extensionState !== "connected") {
          setExtensionState("connected");
        }
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: working, ...(tools.length ? { tools } : {}) }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          if (res.status === 429) throw new Error("Too many requests. Please try again shortly.");
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let calls: ToolCallResult[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as Record<string, unknown>;
            if (event.type === "text") setStreaming((current) => current + String(event.delta ?? ""));
            if (event.type === "assistant_message") {
              const message = event.message as Msg;
              working = [...working, message];
              setMessages(working);
              setStreaming("");
            }
            if (event.type === "tool_calls") calls = event.calls as ToolCallResult[];
            if (event.type === "error") throw new Error(String(event.message ?? "Something went wrong."));
          }
          if (done) break;
        }
        if (!calls.length) {
          completed = true;
          break;
        }
        for (const call of calls) {
          setStatus(`Opening ${call.name.replaceAll("_", " ")}… check for an approval popup`);
          const result = await extension.callTool(call.name, call.args).catch((e) => ({ ok: false, reason: String(e) }));
          const toolMessage: Msg = {
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, 6000),
          };
          working = [...working, toolMessage];
          setMessages(working);
        }
        setStatus("");
      }
      if (!completed) setStatus("Stopped after 6 rounds.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setStreaming("");
      setBusy(false);
      abortRef.current = null;
    }
  }

  const visible = messages.filter((message) =>
    (message.role === "user" || message.role === "assistant") && message.content,
  );

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-neutral-500">
        <span>Portfolio assistant</span>
        <div className="flex items-center gap-3">
          {extensionState === "connected" ? (
            <span className="rounded-full border px-2 py-1">Extension connected{extensionVersion ? ` · v${extensionVersion}` : ""}</span>
          ) : extensionState === "missing" && installUrl ? (
            <a className="underline" href={installUrl} target="_blank" rel="noreferrer">Install the Site Agent extension to let me act in your browser</a>
          ) : extensionState === "missing" ? (
            <span>Chat only</span>
          ) : (
            <span>Checking extension…</span>
          )}
          {auth.status === "signed_in" ? (
            <span className="flex items-center gap-2">
              <a className="underline" href="/account">Signed in{auth.email ? ` · ${auth.email}` : ""}</a>
              <button
                className="underline"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.reload();
                }}
              >
                Sign out
              </button>
            </span>
          ) : auth.status === "checking" ? (
            <span>Checking sign-in…</span>
          ) : (
            <a className="underline" href="/login">Sign in for advanced Gmail tools</a>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {visible.length === 0 && <p className="mt-20 text-center text-neutral-500">Ask me anything.</p>}
        {visible.map((message, index) => (
          <div key={index} className={message.role === "user" ? "ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-4 py-2 text-white" : "w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-neutral-200 px-4 py-2 text-neutral-900"}>{message.content}</div>
        ))}
        {streaming && <div className="w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-neutral-200 px-4 py-2 text-neutral-900">{streaming}</div>}
        <div ref={bottomRef} />
      </div>
      {status && <p className="pb-2 text-sm text-neutral-600">{status}</p>}
      {error && <p className="pb-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 w-2xl">
        <input className="flex-1 rounded-xl border px-4 py-2 w-1/2" placeholder="Ask me anything…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()} disabled={busy} />
        {busy ? <button className="rounded-xl border px-4" onClick={() => abortRef.current?.abort()}>Stop</button> : <button className="rounded-xl bg-blue-600 px-4 text-white disabled:opacity-40" disabled={!input.trim()} onClick={send}>Send</button>}
      </div>
    </main>
  );
}
