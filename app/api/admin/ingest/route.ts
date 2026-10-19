import { ingestDocument } from "@/lib/ingest";
import { requireAdmin, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();

  try {
    const { title, source, text } = await req.json();
    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 200_000
    ) {
      return Response.json(
        {
          error: "title and text are required",
        },
        { status: 400 },
      );
    }
    const result = await ingestDocument({
      title: title.trim(),
      source:
        typeof source === "string" && source.trim()
          ? source.trim()
          : title.trim(),
      text,
    });
    return Response.json(result);
  } catch (error) {
    console.error("Ingest failed:", error);
    return Response.json({ error: "Ingest failed" }, { status: 500 });
  }
}
