import { ingest } from "@/lib/rag";

export async function POST(req: Request) {
  try {
    const { text, source } = await req.json();
    if (typeof text !== "string" || text.trim().length === 0) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }

    const count = await ingest(text, source ?? "pasted-text");
    return Response.json({ chunks: count });
  } catch (error) {
    console.error("Ingest failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 },
    );
  }
}
