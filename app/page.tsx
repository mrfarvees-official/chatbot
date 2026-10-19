"use client";
import { useState } from "react";

export default function Home() {
  const [doc, setDoc] = useState("");
  const [q, setQ] = useState("");
  const [result, setResult] = useState("");

  async function post(url: string, body: object) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status})`);
    return data;
  }

  return (
    <main style={{ maxWidth: 700, margin: "2rem auto", padding: 16 }}>
      <h2>1. Add a document</h2>
      <textarea
        rows={6}
        style={{ width: "100%" }}
        value={doc}
        onChange={(e) => setDoc(e.target.value)}
      />
      <button
        disabled={!doc.trim()}
        onClick={async () => {
          try {
            const { chunks } = await post("/api/ingest", { text: doc });
            setResult(`Ingested ${chunks} chunks`);
          } catch (error) {
            setResult(error instanceof Error ? error.message : "Ingest failed");
          }
        }}
      >
        Ingest
      </button>

      <h2>2. Ask a question</h2>
      <input
        style={{ width: "100%" }}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button
        disabled={!q.trim()}
        onClick={async () => {
          try {
            setResult((await post("/api/chat", { question: q })).answer);
          } catch (error) {
            setResult(error instanceof Error ? error.message : "Chat failed");
          }
        }}
      >
        Ask
      </button>

      <pre style={{ whiteSpace: "pre-wrap" }}>{result}</pre>
    </main>
  );
}
