"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { extension } from "@/lib/extension-client";
import { MarkdownViewer } from "@/app/components/markdown-viewer";

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
          body: JSON.stringify({ messages: working, sessionId: activeSessionId, ...(tools.length ? { tools } : {}) }),
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
    <main className="flex h-dvh w-full overflow-hidden bg-[#08080a] text-[#f4f4f5]">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-[#25252d] bg-[#0d0d10] px-4 py-5 md:flex">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#777783]">History</p>
            <span className="text-sm font-semibold text-[#f4f4f5]">Your chats</span>
          </div>
          <button className="rounded-lg border border-[#343440] bg-[#17171d] px-2.5 py-1.5 text-xs text-[#d8d8df] transition hover:bg-[#22222a]" onClick={startNewChat} disabled={busy}>New chat</button>
        </div>
        <div className="space-y-1 overflow-y-auto">
          {sessions.length === 0 && <p className="rounded-lg border border-dashed border-[#292930] px-3 py-4 text-xs leading-5 text-[#777783]">Your saved conversations will appear here.</p>}
          {sessions.map((session) => (
            <button key={session.id} className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${session.id === sessionId ? "bg-[#1b1b23] text-[#fff]" : "text-[#a6a6b1] hover:bg-[#15151b] hover:text-[#ededf2]"}`} onClick={() => openChat(session)} disabled={historyLoading}>
              <span className="min-w-0 flex-1 truncate">{session.title}</span>
              <span className="hidden text-xs text-[#777783] group-hover:inline" onClick={(event) => removeChat(event, session)}>×</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col bg-[#09090b]">
      <div className="flex min-h-16 items-center justify-between border-b border-[#25252d] px-5 py-3 text-xs text-[#858591] sm:px-8">
        <span>Portfolio assistant</span>
        <div className="flex items-center gap-3">
          <button className="rounded-lg border border-[#343440] bg-[#17171d] px-2.5 py-1.5 text-xs text-[#d8d8df] md:hidden" onClick={startNewChat} disabled={busy}>New chat</button>
          {extensionState === "connected" ? (
            <span className="rounded-full border border-[#343440] bg-[#121217] px-2.5 py-1 text-[#b9b9c4]">Extension connected{extensionVersion ? ` · v${extensionVersion}` : ""}</span>
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
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end space-y-3 pb-4">
        {visible.length === 0 && <div className="mb-auto flex min-h-[38vh] items-center justify-center"><div className="text-center"><div className="mb-3 text-3xl">✦</div><p className="text-sm text-[#858591]">Ask me anything about the portfolio.</p></div></div>}
        {visible.map((message, index) => (
          <div key={index} className={message.role === "user" ? "ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#2563eb] px-4 py-3 text-[15px] leading-6 text-white shadow-lg shadow-blue-950/20" : "w-fit max-w-[85%] rounded-2xl rounded-bl-md border border-[#292930] bg-[#17171d] px-4 py-3 text-[#ededf2]"}>{message.role === "assistant" ? <MarkdownViewer content={message.content ?? ""} /> : message.content}</div>
        ))}
        {streaming && <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md border border-[#292930] bg-[#17171d] px-4 py-3 text-[#ededf2]"><MarkdownViewer content={streaming} /></div>}
        <div ref={bottomRef} />
        </div>
      </div>
      {auth.status === "signed_out" && (
        <p className="mx-auto w-full max-w-4xl px-5 pb-2 text-sm text-[#858591] sm:px-8">
          Sign in with a local email account to use the public chatbot. <a className="underline" href="/login">Continue to sign in</a>
        </p>
      )}
      {status && <p className="mx-auto w-full max-w-4xl px-5 pb-2 text-sm text-[#858591] sm:px-8">{status}</p>}
      {error && <p className="mx-auto w-full max-w-4xl px-5 pb-2 text-sm text-[#f87171] sm:px-8">{error}</p>}
      <div className="border-t border-[#25252d] bg-[#0d0d10] px-5 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-4xl gap-2 rounded-2xl border border-[#30303a] bg-[#141419] p-1.5 shadow-2xl shadow-black/20 focus-within:border-[#4b4b5b]">
        <input className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] text-[#f4f4f5] outline-none placeholder:text-[#6f6f7b]" placeholder="Ask me anything…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()} disabled={busy || auth.status !== "signed_in"} />
        {busy ? <button className="rounded-xl border border-[#343440] px-4 text-sm text-[#d8d8df] hover:bg-[#22222a]" onClick={() => abortRef.current?.abort()}>Stop</button> : <button className="rounded-xl bg-[#2563eb] px-4 text-sm font-medium text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-40" disabled={!input.trim() || auth.status !== "signed_in"} onClick={send}>Send</button>}
        </div>
      </div>
      </section>
    </main>
  );
}
