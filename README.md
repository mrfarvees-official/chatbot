# Portfolio chatbot

This project has one public portfolio chatbot at `/`, an admin-only knowledge-base portal at `/admin`, authenticated visitor profiles at `/account`, and browser actions through the Site Agent Chrome extension.

## Architecture

- Public chat posts to `/api/chat`. It retrieves relevant public knowledge once, makes one streaming NVIDIA model call, and returns NDJSON events.
- If the visitor has Site Agent installed, the browser supplies Gmail and draft/compose tools. The server exposes only the safe subset publicly; authenticated sessions unlock the additional Gmail search/read/reply/archive/delete/label tools. The browser runs tool rounds and sends tool results back in a new request.
- Authentication uses local email/password accounts only. Sessions, profiles, documents, chunks, and embeddings are stored in the local SQLite database through Drizzle. Admin access requires the `ADMIN_EMAILS` allowlist.
- Every ingested document is public to visitors. Do not ingest secrets or personal contact details.

## Environment

Copy the names from `.env.example` into the deployment environment. Never commit `.env` files.

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public application URL |
| `OWNER_NAME` | Owner name used by the public assistant |
| `OWNER_CONTACT_EMAIL` | Contact address used when context lacks an answer |
| `ADMIN_EMAILS` | Comma-separated local email admin allowlist |
| `LOCAL_DB_PATH` | SQLite database path, default `.data/chatbot.sqlite` |
| `NVIDIA_API_KEY` | NVIDIA API key |
| `NVIDIA_BASE_URL` | NVIDIA OpenAI-compatible endpoint |
| `NVIDIA_MODEL` | Chat model |
| `NVIDIA_EMBEDDING_MODEL` | Embedding model; keep the 2048-dimensional model |
| `NVIDIA_REASONING_EFFORT` | Optional model reasoning setting |
| `PUBLIC_TOOL_ALLOWLIST` | Optional comma-separated subset of the safe public tool defaults |
| `NEXT_PUBLIC_EXTENSION_URL` | Optional Site Agent installation link |
| `NEXT_PUBLIC_EXTENSION_DEBUG_LOGGING` | Optional browser/agent pipeline logging flag |
| `RAG_MIN_SIMILARITY` | Optional minimum retrieval similarity; `0` disables filtering |

## Local database

The server creates `.data/chatbot.sqlite` automatically on first start. Drizzle
uses SQLite for users, sessions, profiles, documents, chunks, and embeddings.
Back up that file when deploying. Set `LOCAL_DB_PATH` to an absolute persistent
path in production. The old files in `assets/sql/` are legacy Supabase scripts
and are not used by the application.

Local email/password accounts are stored in SQLite; passwords are salted and
hashed with Node's built-in `scrypt`.

## Development

```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## Extension flow

The public page works without the extension. With the extension installed, trusted public origins can use the site allowlist immediately during this demo phase. Irreversible actions still open a separate approval popup; Gmail and calendar/Meet draft tools open drafts but do not silently send or save them. Origin authentication can be added later without changing the tool protocol.

See `chatbot-agent-extension/README.md` for extension build and unpacked-install instructions.

## Manual test plan

1. Run the local admin seed command, then sign in at `/login`.
2. Open `/` and confirm unauthenticated users cannot submit chat requests.
3. Ingest a Markdown document, replace it using the same source, test retrieval, and delete it from `/admin`.
3. Confirm unauthenticated `/admin` and `/api/admin/*` requests return 401.
4. Sign in through `/login`, complete `/account`, and confirm the profile values are saved.
5. Install/reload the extension and confirm the public page reports it as connected.
5. Ask to email the owner about hiring; confirm a Gmail draft opens addressed to `OWNER_CONTACT_EMAIL` and the assistant asks whether to send.
6. Confirm sending requires the extension approval popup and denial performs no send.
7. Without a session, confirm read/archive/delete/mailbox tools are filtered by the server. With a session, test the authenticated Gmail tools and approval popup.

## Unverified integrations

Gmail and Google Meet selectors, NVIDIA model tool-calling/reasoning behavior, and Chrome extension runtime behavior require manual verification against the live services.
