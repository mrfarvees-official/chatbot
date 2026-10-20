"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
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
type ChatSession = { id: string; title: string; updatedAt: string; messageCount: number };

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
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
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
    if (auth.status !== "signed_in") return;
    fetch("/api/chat/sessions")
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load chat history");
        return res.json() as Promise<{ sessions: ChatSession[] }>;
      })
      .then(async (data) => {
        setSessions(data.sessions ?? []);
        const latest = data.sessions?.[0];
        if (!latest) return;
        const res = await fetch(`/api/chat/sessions/${latest.id}`);
        const loaded = await res.json();
        if (!res.ok) throw new Error(loaded.error ?? "Could not load chat session");
        setSessionId(latest.id);
        setMessages(loaded.messages ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load chat history"));
  }, [auth.status]);

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
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        const created = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: text.slice(0, 80) }),
        });
        const data = await created.json();
        if (!created.ok) throw new Error(data.error ?? "Could not create chat session");
        activeSessionId = data.session.id as string;
        setSessionId(activeSessionId);
        setSessions((current) => [data.session, ...current]);
      }
      let completed = false;
      await saveHistory(activeSessionId, working);
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
          await saveHistory(activeSessionId, working);
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
        await saveHistory(activeSessionId, working);
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

  async function saveHistory(id: string | null, history: Msg[]) {
    if (!id) return;
    const res = await fetch(`/api/chat/sessions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    if (!res.ok) throw new Error("Could not save chat history");
    setSessions((current) => current.map((session) => session.id === id
      ? { ...session, messageCount: history.length, updatedAt: new Date().toISOString() }
      : session));
  }

  async function startNewChat() {
    if (busy) return;
    setSessionId(null);
    setMessages([]);
    setStreaming("");
    setError("");
    setStatus("");
  }

  async function openChat(session: ChatSession) {
    if (busy || session.id === sessionId) return;
    setHistoryLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/chat/sessions/${session.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load chat session");
      setSessionId(session.id);
      setMessages(data.messages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chat session");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function removeChat(event: MouseEvent, session: ChatSession) {
    event.stopPropagation();
    if (busy || !window.confirm("Delete this chat session?")) return;
    const res = await fetch(`/api/chat/sessions/${session.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete chat session");
      return;
    }
    setSessions((current) => current.filter((item) => item.id !== session.id));
    if (session.id === sessionId) startNewChat();
  }

  const visible = messages.filter((message) =>
    (message.role === "user" || message.role === "assistant") && message.content,
  );

  return (
    <main className="mx-auto flex h-dvh max-w-5xl gap-4 p-4">
      <aside className="hidden w-64 shrink-0 flex-col border-r pr-3 md:flex">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Your chats</span>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={startNewChat} disabled={busy}>New chat</button>
        </div>
        <div className="space-y-1 overflow-y-auto">
          {sessions.length === 0 && <p className="text-xs text-neutral-500">No saved chats yet.</p>}
          {sessions.map((session) => (
            <button key={session.id} className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${session.id === sessionId ? "bg-neutral-200" : "hover:bg-neutral-100"}`} onClick={() => openChat(session)} disabled={historyLoading}>
              <span className="min-w-0 flex-1 truncate">{session.title}</span>
              <span className="hidden text-xs text-neutral-500 group-hover:inline" onClick={(event) => removeChat(event, session)}>×</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="mx-auto flex min-w-0 max-w-2xl flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between text-xs text-neutral-500">
        <span>Portfolio assistant</span>
        <div className="flex items-center gap-3">
          <button className="rounded-lg border px-2 py-1 text-xs md:hidden" onClick={startNewChat} disabled={busy}>New chat</button>
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
      {auth.status === "signed_out" && (
        <p className="pb-2 text-sm text-neutral-600">
          Sign in with a local email account to use the public chatbot. <a className="underline" href="/login">Continue to sign in</a>
        </p>
      )}
      {status && <p className="pb-2 text-sm text-neutral-600">{status}</p>}
      {error && <p className="pb-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 w-2xl">
        <input className="flex-1 rounded-xl border px-4 py-2 w-1/2" placeholder="Ask me anything…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()} disabled={busy || auth.status !== "signed_in"} />
        {busy ? <button className="rounded-xl border px-4" onClick={() => abortRef.current?.abort()}>Stop</button> : <button className="rounded-xl bg-blue-600 px-4 text-white disabled:opacity-40" disabled={!input.trim() || auth.status !== "signed_in"} onClick={send}>Send</button>}
      </div>
      </section>
    </main>
  );
}
