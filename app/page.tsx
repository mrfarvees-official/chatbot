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
  | { role: "user"; content: string; createdAt?: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; createdAt?: string }
  | { role: "tool"; tool_call_id: string; content: string; createdAt?: string };

type Tool = { name: string; description: string; inputSchema: object };
type ToolCallResult = { id: string; name: string; args: unknown };
type ChatSession = { id: string; title: string; updatedAt: string; messageCount: number };
type Profile = { first_name?: string | null; last_name?: string | null; mobile_number?: string | null };

const installUrl = process.env.NEXT_PUBLIC_EXTENSION_URL;

function formatMessageTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function ActionIcon({ kind }: { kind: "copy" | "edit" | "resend" | "check" | "send" | "stop" | "theme" }) {
  const paths = {
    copy: <><rect x="8" y="8" width="10" height="10" rx="1" /><path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    resend: <><path d="M3 12a9 9 0 0 1 15.2-6.5L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.2 6.5L3 16" /><path d="M3 21v-5h5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
    theme: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></>,
  }[kind];
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">{paths}</svg>;
}

function ToolIcon({ kind }: { kind: "gmail" | "calendar" | "meet" | "browser" }) {
  const paths = {
    gmail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></>,
    meet: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3Z" /></>,
    browser: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.2 2.5 3.3 5.5 3.3 9s-1.1 6.5-3.3 9c-2.2-2.5-3.3-5.5-3.3-9S9.8 5.5 12 3Z" /></>,
  }[kind];
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 chatbot-tool-${kind}`}>{paths}</svg>;
}

function WorkIndicator({ busy, status, streaming, activeTool }: { busy: boolean; status: string; streaming: string; activeTool: string | null }) {
  if (!busy) return null;
  const label = status || (streaming ? "Writing response" : "Thinking");
  const kind = activeTool?.startsWith("gmail_") ? "gmail" : activeTool?.startsWith("calendar_") ? "calendar" : activeTool?.startsWith("meet_") ? "meet" : activeTool ? "browser" : null;
  return <div className="chatbot-muted flex items-center gap-2 py-2 text-xs" aria-live="polite">
    <span className="chatbot-work-orb flex h-5 w-5 items-center justify-center rounded-full bg-[#2563eb]/20">{kind ? <ToolIcon kind={kind} /> : <span className="h-2 w-2 rounded-full bg-[#60a5fa]" />}</span>
    <span>{label}</span>
    <span className="flex items-end gap-0.5" aria-hidden="true"><span className="chatbot-work-dot h-1 w-1 rounded-full bg-[#858591]" /><span className="chatbot-work-dot h-1 w-1 rounded-full bg-[#858591]" /><span className="chatbot-work-dot h-1 w-1 rounded-full bg-[#858591]" /></span>
  </div>;
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [extensionState, setExtensionState] = useState<"checking" | "connected" | "missing">("checking");
  const [extensionVersion, setExtensionVersion] = useState("");
  const [auth, setAuth] = useState<{ status: "checking" | "signed_in" | "signed_out"; email?: string }>({ status: "checking" });
  const [profile, setProfile] = useState<Profile>({});
  const [streaming, setStreaming] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("chatbot-theme");
    if (saved === "light" || saved === "dark") window.setTimeout(() => setTheme(saved), 0);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("chatbot-theme", theme);
  }, [theme]);

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
    if (auth.status !== "signed_in") {
      return;
    }
    fetch("/api/profile")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setProfile(data?.profile ?? {}))
      .catch(() => setProfile({}));
  }, [auth.status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, status]);

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    setStatus("");
    setStreaming("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let working: Msg[] = [...messages, { role: "user", content: text, createdAt: new Date().toISOString() }];
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
              const message = { ...(event.message as Msg), createdAt: new Date().toISOString() };
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
          setActiveTool(call.name);
          setStatus(`Opening ${call.name.replaceAll("_", " ")}… check for an approval popup`);
          const result = await extension.callTool(call.name, call.args).catch((e) => ({ ok: false, reason: String(e) }));
          setActiveTool(null);
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
      setActiveTool(null);
      abortRef.current = null;
    }
  }

  async function copyMessage(key: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessage(key);
      window.setTimeout(() => setCopiedMessage((current) => current === key ? null : current), 1500);
    } catch {
      setError("Could not copy this message");
    }
  }

  function editMessage(content: string) {
    setInput(content);
    setError("");
    inputRef.current?.focus();
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
  const profileName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <main className="chatbot-shell flex h-dvh w-full overflow-hidden">
      <aside className="chatbot-sidebar hidden w-72 shrink-0 flex-col border-r px-4 py-5 md:flex">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="chatbot-subtle text-[11px] uppercase tracking-[0.2em]">History</p>
            <span className="text-sm font-semibold">Your chats</span>
          </div>
          <button className="chatbot-surface rounded-lg border px-2.5 py-1.5 text-xs text-[var(--chatbot-text-soft)] transition hover:brightness-95" onClick={startNewChat} disabled={busy}>New chat</button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {sessions.length === 0 && <p className="chatbot-subtle rounded-lg border border-dashed px-3 py-4 text-xs leading-5">Your saved conversations will appear here.</p>}
          {sessions.map((session) => (
            <button key={session.id} className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${session.id === sessionId ? "chatbot-surface text-[var(--foreground)]" : "text-[var(--chatbot-text-soft)] hover:brightness-95"}`} onClick={() => openChat(session)} disabled={historyLoading}>
              <span className="min-w-0 flex-1 truncate">{session.title}</span>
              <span className="chatbot-subtle hidden text-xs group-hover:inline" onClick={(event) => removeChat(event, session)}>×</span>
            </button>
          ))}
        </div>
        <div className="chatbot-header mt-4 space-y-3 border-t pt-4 text-xs">
          <div>
            <p className="chatbot-subtle mb-2 uppercase tracking-[0.16em]">Browser access</p>
            {extensionState === "connected" ? (
              <span className="chatbot-surface inline-flex rounded-full border px-2.5 py-1 text-[var(--chatbot-text-soft)]">Extension connected{extensionVersion ? ` · v${extensionVersion}` : ""}</span>
            ) : extensionState === "missing" && installUrl ? (
              <a className="underline" href={installUrl} target="_blank" rel="noreferrer">Install Site Agent extension</a>
            ) : extensionState === "missing" ? <span>Chat only</span> : <span>Checking extension…</span>}
          </div>
          <div>
            <p className="chatbot-subtle mb-2 uppercase tracking-[0.16em]">Account</p>
            {auth.status === "signed_in" ? (
              <div className="chatbot-surface space-y-2 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{profileName || "Signed in"}</p>
                  <p className="chatbot-subtle truncate">{auth.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <a className="underline" href="/account">View profile</a>
                  <button className="underline" onClick={signOut}>Sign out</button>
                </div>
              </div>
            ) : auth.status === "checking" ? <span>Checking sign-in…</span> : <a className="underline" href="/login">Sign in for advanced tools</a>}
          </div>
        </div>
      </aside>
      <section className="chatbot-panel flex min-w-0 flex-1 flex-col">
      <div className="chatbot-header flex min-h-16 items-center justify-between border-b px-5 py-3 text-xs sm:px-8">
        <span>Portfolio assistant</span>
        <div className="flex items-center gap-3">
          <button
            className="chatbot-surface chatbot-icon-button rounded-lg border p-2 text-[var(--chatbot-text-soft)]"
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          >
            <ActionIcon kind="theme" />
          </button>
          <button className="chatbot-surface rounded-lg border px-2.5 py-1.5 text-xs text-[var(--chatbot-text-soft)] md:hidden" onClick={startNewChat} disabled={busy}>New chat</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end space-y-3 pb-4">
        {visible.length === 0 && <div className="mb-auto flex min-h-[38vh] items-center justify-center"><div className="text-center"><div className="mb-3 text-3xl">✦</div><p className="chatbot-muted text-sm">Ask me anything about the portfolio.</p></div></div>}
        {visible.map((message, index) => (
          <div key={index} className={`group relative ${message.role === "user" ? "ml-auto" : ""} w-fit max-w-[85%]`}>
            <div className={message.role === "user" ? "whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#2563eb] px-4 py-3 text-[15px] leading-6 text-white shadow-lg shadow-blue-950/20" : "chatbot-assistant-bubble rounded-2xl rounded-bl-md border px-4 py-3"}>{message.role === "assistant" ? <MarkdownViewer content={message.content ?? ""} /> : message.content}</div>
            <div className={`chatbot-subtle mt-1 flex items-center gap-2 text-[11px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.createdAt && <time className={message.role === "user" ? "order-2 mr-1" : "order-1"} dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>}
              <span className={`flex gap-1 ${message.role === "user" ? "order-1" : "order-2"}`}>
                <button title={copiedMessage === `${message.role}-${index}` ? "Copied" : "Copy message"} aria-label={copiedMessage === `${message.role}-${index}` ? "Copied" : "Copy message"} className="chatbot-icon-button rounded p-1" onClick={() => copyMessage(`${message.role}-${index}`, message.content ?? "")}>{copiedMessage === `${message.role}-${index}` ? <ActionIcon kind="check" /> : <ActionIcon kind="copy" />}</button>
                {message.role === "user" && <><button title="Edit message" aria-label="Edit message" className="chatbot-icon-button rounded p-1" onClick={() => editMessage(message.content)}><ActionIcon kind="edit" /></button><button title="Resend message" aria-label="Resend message" className="chatbot-icon-button rounded p-1" onClick={() => send(message.content)}><ActionIcon kind="resend" /></button></>}
              </span>
            </div>
          </div>
        ))}
        {streaming && <div className="chatbot-assistant-bubble w-fit max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-3"><MarkdownViewer content={streaming} /></div>}
        <WorkIndicator busy={busy} status={status} streaming={streaming} activeTool={activeTool} />
        <div ref={bottomRef} />
        </div>
      </div>
      {auth.status === "signed_out" && (
        <p className="mx-auto w-full max-w-4xl px-5 pb-2 text-sm text-[#858591] sm:px-8">
          Sign in with a local email account to use the public chatbot. <a className="underline" href="/login">Continue to sign in</a>
        </p>
      )}
      {status && !busy && <p className="mx-auto w-full max-w-4xl px-5 pb-2 text-sm text-[#858591] sm:px-8">{status}</p>}
      {error && <p className="mx-auto w-full max-w-4xl px-5 pb-2 text-sm text-[#f87171] sm:px-8">{error}</p>}
      <div className="chatbot-composer-bar border-t px-5 py-4 sm:px-8">
        <div className="chatbot-composer mx-auto flex w-full max-w-4xl gap-2 rounded-2xl border p-1.5 shadow-2xl shadow-black/20 focus-within:border-[#4b4b5b]">
        <input ref={inputRef} className="chatbot-input min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] outline-none" placeholder="Ask me anything…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()} disabled={busy || auth.status !== "signed_in"} />
        {busy ? <button title="Stop response" aria-label="Stop response" className="chatbot-surface flex h-10 w-10 items-center justify-center rounded-xl border text-sm text-[var(--chatbot-text-soft)] transition hover:brightness-95" onClick={() => abortRef.current?.abort()}><ActionIcon kind="stop" /></button> : <button title="Send message" aria-label="Send message" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563eb] text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-40" disabled={!input.trim() || auth.status !== "signed_in"} onClick={() => send()}><ActionIcon kind="send" /></button>}
        </div>
      </div>
      </section>
    </main>
  );
}
