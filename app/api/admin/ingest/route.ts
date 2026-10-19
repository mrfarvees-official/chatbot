import { ingestDocument } from "@/lib/ingest";
import { requireAdmin, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();

  try {
    const { title, source, text, visibility } = await req.json();
    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 200_000 ||
      (visibility !== "public" && visibility !== "private")
    ) {
      return Response.json(
        {
          error: "title, text and visibility ('public'|'private') are required",
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
      visibility,
      text,
    });
    return Response.json(result);
  } catch (error) {
    console.error("Ingest failed:", error);
    return Response.json({ error: "Ingest failed" }, { status: 500 });
  }
}
