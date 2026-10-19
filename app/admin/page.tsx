"use client";

import { useCallback, useEffect, useState } from "react";

type Doc = {
  id: string;
  title: string;
  source: string | null;
  updated_at: string;
  chunks: { count: number }[];
};

type SearchResult = {
  title: string;
  similarity: number;
  score: number;
  snippet: string;
};

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Signed out");
  }
  if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
  return data;
}

export default function Admin() {
  const [email, setEmail] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState("");

  const load = useCallback(async () => {
    setDocs((await api("/api/admin/docs")).docs);
  }, []);

  useEffect(() => {
    api("/api/admin/me")
      .then((d) => setEmail(d.email))
      .then(load)
      .catch(() => {});
  }, [load]);

  async function ingest() {
    setStatus("Ingesting…");
    try {
      const r = await api("/api/admin/ingest", {
        method: "POST",
        body: JSON.stringify({
          title,
          source: source.trim() || undefined,
          text,
        }),
      });
      setStatus(
        r.status === "unchanged"
          ? "Already up to date"
          : `Ingested ${r.chunks} chunks`,
      );
      setTitle("");
      setSource("");
      setText("");
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    }
  }

  async function onFile(file?: File) {
    if (!file) return;
    setText(await file.text());
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    if (!source) setSource(file.name);
  }

  async function testRetrieval() {
    setSearchStatus("Searching…");
    try {
      const data = await api("/api/admin/search", {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      setResults(data.results);
      setSearchStatus(`${data.results.length} results`);
    } catch (e) {
      setSearchStatus(e instanceof Error ? e.message : "Search failed");
    }
  }

  if (!email) return <main className="p-8">Checking access…</main>;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin</h1>
        <span className="text-sm text-neutral-500">
          {email}{" "}
          <button
            className="underline"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" }).catch(() => {});
              window.location.href = "/login";
            }}
          >
            sign out
          </button>
        </span>
      </header>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        Everything you add here is visible to all visitors through the chatbot.
        Never add secrets or personal contact details.
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Add or replace document</h2>
        <input className="w-full rounded-xl border px-4 py-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="w-full rounded-xl border px-4 py-2" placeholder="Source (optional; same source replaces the existing document)" value={source} onChange={(e) => setSource(e.target.value)} />
        <textarea className="w-full rounded-xl border px-4 py-2" rows={8} placeholder="Paste text, or choose a .txt/.md file" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex items-center gap-3">
          <input type="file" accept=".txt,.md" onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="rounded-xl bg-blue-600 px-4 py-2 text-white disabled:opacity-40" disabled={!title.trim() || !text.trim()} onClick={ingest}>Ingest</button>
        </div>
        {status && <p className="text-sm text-neutral-600">{status}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Test retrieval</h2>
        <div className="flex gap-2">
          <input className="flex-1 rounded-xl border px-4 py-2" placeholder="Ask a knowledge-base question" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && testRetrieval()} />
          <button className="rounded-xl border px-4 disabled:opacity-40" disabled={!query.trim()} onClick={testRetrieval}>Search</button>
        </div>
        {searchStatus && <p className="text-sm text-neutral-600">{searchStatus}</p>}
        {results.map((r, i) => <article key={`${r.title}-${i}`} className="rounded-xl border p-3 text-sm"><div className="font-medium">{r.title}</div><div className="text-xs text-neutral-500">similarity {r.similarity.toFixed(3)} · score {r.score.toFixed(4)}</div><p className="mt-1 whitespace-pre-wrap">{r.snippet}</p></article>)}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Documents ({docs.length})</h2>
        {docs.map((d) => <div key={d.id} className="flex items-center justify-between rounded-xl border px-4 py-2"><div><div className="font-medium">{d.title}</div><div className="text-xs text-neutral-500">{d.source ?? "No source"} · {d.chunks?.[0]?.count ?? 0} chunks · {new Date(d.updated_at).toLocaleString()}</div></div><button className="rounded-lg border px-3 py-1 text-sm text-red-600" onClick={async () => { if (!confirm(`Delete "${d.title}"?`)) return; await api("/api/admin/docs", { method: "DELETE", body: JSON.stringify({ id: d.id }) }); await load(); }}>delete</button></div>)}
      </section>
    </main>
  );
}
