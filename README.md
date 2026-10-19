# Portfolio chatbot

This project has one public portfolio chatbot at `/`, an admin-only knowledge-base portal at `/admin`, and optional browser actions through the Site Agent Chrome extension.

## Architecture

- Public chat posts to `/api/chat`. It retrieves relevant public knowledge once, makes one streaming NVIDIA model call, and returns NDJSON events.
- If the visitor has Site Agent installed, the browser supplies an allowlisted set of draft/compose tools. The browser runs tool rounds and sends tool results back in a new request.
- Admin magic-link authentication uses Supabase and the `ADMIN_EMAILS` allowlist. Only the admin portal can ingest, replace, delete, or test documents.
- Every ingested document is public to visitors. Do not ingest secrets or personal contact details.

## Environment

Copy the names from `.env.example` into the deployment environment. Never commit `.env` files.

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public application URL and Supabase redirect base |
| `OWNER_NAME` | Owner name used by the public assistant |
| `OWNER_CONTACT_EMAIL` | Contact address used when context lacks an answer |
| `ADMIN_EMAILS` | Comma-separated admin magic-link allowlist |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase browser/auth key |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key |
| `NVIDIA_API_KEY` | NVIDIA API key |
| `NVIDIA_BASE_URL` | NVIDIA OpenAI-compatible endpoint |
| `NVIDIA_MODEL` | Chat model |
| `NVIDIA_EMBEDDING_MODEL` | Embedding model; keep the 2048-dimensional model |
| `NVIDIA_REASONING_EFFORT` | Optional model reasoning setting |
| `PUBLIC_TOOL_ALLOWLIST` | Optional comma-separated subset of the safe public tool defaults |
| `NEXT_PUBLIC_EXTENSION_URL` | Optional Site Agent installation link |
| `NEXT_PUBLIC_EXTENSION_DEBUG_LOGGING` | Optional browser/agent pipeline logging flag |
| `RAG_MIN_SIMILARITY` | Optional minimum retrieval similarity; `0` disables filtering |

## Database deployment order

For an existing database:

1. Run `assets/sql/002_remove_visibility.sql` in the Supabase SQL Editor.
2. Wait a few seconds for PostgREST to reload its schema cache.
3. Deploy the chatbot code.
4. Load the extension build if browser tools are enabled.

For a fresh database, run `assets/sql/rag.sql`. It is a destructive reset script intended for a new or intentionally reset project. The 2048-dimensional vector column is intentionally not HNSW-indexed because pgvector limits HNSW indexes to 2000 dimensions.

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

1. Open `/` without the extension and confirm normal streaming chat and the install hint.
2. Authenticate through `/login`, ingest a Markdown document, replace it using the same source, test retrieval, and delete it from `/admin`.
3. Confirm unauthenticated `/admin` and `/api/admin/*` requests return 401.
4. Install/reload the extension and confirm the public page reports it as connected.
5. Ask to email the owner about hiring; confirm a Gmail draft opens addressed to `OWNER_CONTACT_EMAIL` and the assistant asks whether to send.
6. Confirm sending requires the extension approval popup and denial performs no send.
7. Confirm read/archive/delete/mailbox tools are not exposed to the public bridge.

## Unverified integrations

Gmail and Google Meet selectors, NVIDIA model tool-calling/reasoning behavior, and Chrome extension runtime behavior require manual verification against the live services.
