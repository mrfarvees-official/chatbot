import "server-only";

export type Source = { title: string; source?: string; content: string };

// Scope is decided by the route, never by the request body.
export type Scope = "public" | "admin";

export async function retrieve(
  _query: string,
  _scope: Scope,
): Promise<Source[]> {
  return []; // RAG step: embed the query and call match_chunks here
}
