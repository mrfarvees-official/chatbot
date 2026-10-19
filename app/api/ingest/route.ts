import { ingestDocument } from "@/lib/ingest";
import { requireAdmin, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();

  try {
    const { text, source } = await req.json();
    if (typeof text !== "string" || text.trim().length === 0) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }

    const result = await ingestDocument({
      title: source ?? "pasted-text",
      source: source ?? "pasted-text",
      visibility: "public",
      text,
    });
    return Response.json(result);
  } catch (error) {
    console.error("Ingest failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 },
    );
  }
}
