import { requireAdmin, unauthorized } from "@/lib/auth";
import { retrieve } from "@/lib/retrieval";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const { query } = await req.json().catch(() => ({}));
  if (typeof query !== "string" || !query.trim() || query.length > 2000) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }
  const results = await retrieve(query.trim());
  return Response.json({
    results: results.map((result) => ({
      title: result.title,
      similarity: result.similarity ?? 0,
      score: result.score ?? 0,
      snippet: result.content.slice(0, 300),
    })),
  });
}
