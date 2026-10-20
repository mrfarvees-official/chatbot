"use client";

import { useCallback, useEffect, useState } from "react";
import "./admin.module.css";

// The project's Tailwind Turbopack loader emits CSS module selectors globally.
// Keep an explicit class map so the stylesheet remains usable with that loader.
const styles = {
  account: "account",
  accountText: "accountText",
  avatar: "avatar",
  backLink: "backLink",
  brand: "brand",
  brandMark: "brandMark",
  card: "card",
  deleteButton: "deleteButton",
  docIcon: "docIcon",
  docMeta: "docMeta",
  docName: "docName",
  documentList: "documentList",
  documentRow: "documentRow",
  documentsCard: "documentsCard",
  documentsHeader: "documentsHeader",
  emptyDocuments: "emptyDocuments",
  emptyState: "emptyState",
  eyebrow: "eyebrow",
  fileButton: "fileButton",
  formFooter: "formFooter",
  formGrid: "formGrid",
  headerActions: "headerActions",
  hero: "hero",
  iconButton: "iconButton",
  ingestCard: "ingestCard",
  inlineStatus: "inlineStatus",
  loading: "loading",
  loadingMark: "loadingMark",
  notice: "notice",
  noticeIcon: "noticeIcon",
  page: "page",
  primaryButton: "primaryButton",
  result: "result",
  results: "results",
  searchBox: "searchBox",
  searchCard: "searchCard",
  sectionHeader: "sectionHeader",
  sectionIcon: "sectionIcon",
  shell: "shell",
  stats: "stats",
  submitGroup: "submitGroup",
  textareaLabel: "textareaLabel",
  topbar: "topbar",
  workspace: "workspace",
} as const;

type Doc = { id: string; title: string; source: string | null; updated_at: string; chunks: { count: number }[] };
type SearchResult = { title: string; similarity: number; score: number; snippet: string };
type IconName = "arrow" | "document" | "search" | "sun" | "moon" | "upload" | "warning" | "trash";

function Icon({ name }: { name: IconName }) {
  const paths = {
    arrow: <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>,
    document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></>,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
    upload: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 21h14a2 2 0 0 0 2-2v-4M3 15v4a2 2 0 0 0 2 2" /></>,
    warning: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5" /></>,
  }[name];
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>;
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.replace("/login");
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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const load = useCallback(async () => setDocs((await api("/api/admin/docs")).docs), []);

  useEffect(() => {
    const saved = window.localStorage.getItem("chatbot-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
    api("/api/admin/me").then((data) => setEmail(data.email)).then(load).catch(() => {});
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("chatbot-theme", theme);
  }, [theme]);

  async function ingest() {
    setStatus("Ingesting…");
    try {
      const response = await api("/api/admin/ingest", { method: "POST", body: JSON.stringify({ title, source: source.trim() || undefined, text }) });
      setStatus(response.status === "unchanged" ? "Already up to date" : `Ingested ${response.chunks} chunks`);
      setTitle(""); setSource(""); setText("");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed");
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
      const data = await api("/api/admin/search", { method: "POST", body: JSON.stringify({ query }) });
      setResults(data.results);
      setSearchStatus(`${data.results.length} results`);
    } catch (error) {
      setSearchStatus(error instanceof Error ? error.message : "Search failed");
    }
  }

  const totalChunks = docs.reduce((sum, doc) => sum + (doc.chunks?.[0]?.count ?? 0), 0);

  if (!email) return <main className={styles.loading}><span className={styles.loadingMark}>✦</span><p>Checking access…</p></main>;

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/" aria-label="Back to chatbot">
          <span className={styles.brandMark}>✦</span>
          <span><strong>Chatbot</strong><small>Admin workspace</small></span>
        </a>
        <div className={styles.headerActions}>
          <a className={styles.backLink} href="/"><Icon name="arrow" />Back to chatbot</a>
          <button className={styles.iconButton} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
          <div className={styles.account}>
            <span className={styles.avatar}>{email.slice(0, 1).toUpperCase()}</span>
            <span className={styles.accountText}><small>Administrator</small><strong>{email}</strong></span>
            <button onClick={async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); window.location.replace("/login"); }}>Sign out</button>
          </div>
        </div>
      </header>

      <div className={styles.page}>
        <section className={styles.hero}>
          <div><p className={styles.eyebrow}>Knowledge management</p><h1>Admin dashboard</h1><p>Manage the content your chatbot uses and test the quality of its retrieval.</p></div>
          <div className={styles.stats}><div><strong>{docs.length}</strong><span>Documents</span></div><div><strong>{totalChunks}</strong><span>Knowledge chunks</span></div></div>
        </section>

        <aside className={styles.notice}>
          <span className={styles.noticeIcon}><Icon name="warning" /></span>
          <div><strong>Public knowledge base</strong><p>Everything added here can be surfaced to visitors through the chatbot. Never add secrets or personal contact details.</p></div>
        </aside>

        <div className={styles.workspace}>
          <section className={`${styles.card} ${styles.ingestCard}`}>
            <div className={styles.sectionHeader}><span className={styles.sectionIcon}><Icon name="upload" /></span><div><p className={styles.eyebrow}>Content</p><h2>Add or replace a document</h2><p>Paste content directly or upload a Markdown or text file.</p></div></div>
            <div className={styles.formGrid}>
              <label><span>Document title</span><input placeholder="e.g. Company handbook" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label><span>Source <small>Optional</small></span><input placeholder="Same source replaces the existing document" value={source} onChange={(event) => setSource(event.target.value)} /></label>
            </div>
            <label className={styles.textareaLabel}><span>Content</span><textarea rows={12} placeholder="Paste the document text here…" value={text} onChange={(event) => setText(event.target.value)} /></label>
            <div className={styles.formFooter}>
              <label className={styles.fileButton}><Icon name="document" /><span>Choose .txt or .md</span><input type="file" accept=".txt,.md" onChange={(event) => onFile(event.target.files?.[0])} /></label>
              <div className={styles.submitGroup}>{status && <p role="status">{status}</p>}<button className={styles.primaryButton} disabled={!title.trim() || !text.trim()} onClick={ingest}>Ingest document</button></div>
            </div>
          </section>

          <section className={`${styles.card} ${styles.searchCard}`}>
            <div className={styles.sectionHeader}><span className={styles.sectionIcon}><Icon name="search" /></span><div><p className={styles.eyebrow}>Quality check</p><h2>Test retrieval</h2><p>See which knowledge snippets answer a sample question.</p></div></div>
            <label className={styles.searchBox}><span className="sr-only">Knowledge-base question</span><input placeholder="Ask a knowledge-base question" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && testRetrieval()} /><button disabled={!query.trim()} onClick={testRetrieval}><Icon name="search" /><span>Search</span></button></label>
            {searchStatus && <p className={styles.inlineStatus} role="status">{searchStatus}</p>}
            <div className={styles.results}>
              {results.length === 0 && searchStatus !== "Searching…" ? <div className={styles.emptyState}><Icon name="search" /><p>Search results will appear here.</p></div> : results.map((result, index) => (
                <article key={`${result.title}-${index}`} className={styles.result}><div><strong>{result.title}</strong><span>{Math.round(result.similarity * 100)}% match</span></div><p>{result.snippet}</p><small>Similarity {result.similarity.toFixed(3)} · Score {result.score.toFixed(4)}</small></article>
              ))}
            </div>
          </section>
        </div>

        <section className={`${styles.card} ${styles.documentsCard}`}>
          <div className={styles.documentsHeader}><div className={styles.sectionHeader}><span className={styles.sectionIcon}><Icon name="document" /></span><div><p className={styles.eyebrow}>Library</p><h2>Documents</h2><p>{docs.length} {docs.length === 1 ? "document" : "documents"} currently available to the chatbot.</p></div></div></div>
          <div className={styles.documentList}>
            {docs.length === 0 ? <div className={styles.emptyDocuments}><Icon name="document" /><h3>No documents yet</h3><p>Add your first document above to build the knowledge base.</p></div> : docs.map((doc) => (
              <article className={styles.documentRow} key={doc.id}>
                <span className={styles.docIcon}><Icon name="document" /></span>
                <div className={styles.docName}><strong>{doc.title}</strong><span>{doc.source ?? "No source provided"}</span></div>
                <div className={styles.docMeta}><strong>{doc.chunks?.[0]?.count ?? 0}</strong><span>Chunks</span></div>
                <div className={styles.docMeta}><strong>{new Date(doc.updated_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</strong><span>Last updated</span></div>
                <button className={styles.deleteButton} aria-label={`Delete ${doc.title}`} title={`Delete ${doc.title}`} onClick={async () => { if (!confirm(`Delete "${doc.title}"?`)) return; await api("/api/admin/docs", { method: "DELETE", body: JSON.stringify({ id: doc.id }) }); await load(); }}><Icon name="trash" /></button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
