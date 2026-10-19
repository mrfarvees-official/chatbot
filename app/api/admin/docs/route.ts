import { requireAdmin, unauthorized } from "@/lib/auth";
import { db, sql } from "@/lib/local-db";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  const rows = db.all(sql`select d.id, d.title, d.source, d.updated_at, count(c.id) as chunk_count from documents d left join chunks c on c.document_id = d.id group by d.id order by d.updated_at desc`) as Array<Record<string, unknown>>;
  const docs = rows.map((doc) => ({ ...doc, chunks: [{ count: Number(doc.chunk_count) }] }));
  return Response.json({ docs });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string")
    return Response.json({ error: "Invalid input" }, { status: 400 });
  db.run(sql`delete from documents where id = ${id}`);
  return Response.json({ ok: true });
}
