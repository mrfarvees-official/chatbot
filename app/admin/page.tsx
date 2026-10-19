"use client";
import { useCallback, useEffect, useState } from "react";

type Doc = {
  id: string;
  title: string;
  source: string | null;
  visibility: "public" | "private";
  updated_at: string;
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
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [status, setStatus] = useState("");

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
        body: JSON.stringify({ title, text, visibility }),
      });
      setStatus(
        r.status === "unchanged"
          ? "Already up to date"
          : `Ingested ${r.chunks} chunks`,
      );
      setTitle("");
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

      <section className="space-y-2">
        <h2 className="font-medium">Add document</h2>
        <input
          className="w-full rounded-xl border px-4 py-2"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full rounded-xl border px-4 py-2"
          rows={8}
          placeholder="Paste text, or choose a .txt/.md file"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".txt,.md"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <select
            className="rounded-xl border px-3 py-2"
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as "public" | "private")
            }
          >
            <option value="private">private (admin only)</option>
            <option value="public">public (bot can use it)</option>
          </select>
          <button
            className="rounded-xl bg-blue-600 px-4 py-2 text-white disabled:opacity-40"
            disabled={!title.trim() || !text.trim()}
            onClick={ingest}
          >
            Ingest
          </button>
        </div>
        {status && <p className="text-sm text-neutral-600">{status}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Documents ({docs.length})</h2>
        {docs.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-xl border px-4 py-2"
          >
            <div>
              <div className="font-medium">{d.title}</div>
              <div className="text-xs text-neutral-500">
                {new Date(d.updated_at).toLocaleString()}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg border px-3 py-1 text-sm"
                onClick={async () => {
                  await api("/api/admin/docs", {
                    method: "PATCH",
                    body: JSON.stringify({
                      id: d.id,
                      visibility:
                        d.visibility === "public" ? "private" : "public",
                    }),
                  });
                  load();
                }}
              >
                {d.visibility}
              </button>
              <button
                className="rounded-lg border px-3 py-1 text-sm text-red-600"
                onClick={async () => {
                  if (!confirm(`Delete "${d.title}"?`)) return;
                  await api("/api/admin/docs", {
                    method: "DELETE",
                    body: JSON.stringify({ id: d.id }),
                  });
                  load();
                }}
              >
                delete
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
