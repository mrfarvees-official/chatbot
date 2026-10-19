import { requireAdmin, unauthorized } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  const { data, error } = await getSupabaseAdmin()
    .from("documents")
    .select("id, title, source, updated_at, chunks(count)")
    .order("updated_at", { ascending: false });
  if (error) return Response.json({ error: "Failed to load" }, { status: 500 });
  return Response.json({ docs: data });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string")
    return Response.json({ error: "Invalid input" }, { status: 400 });
  const { error } = await getSupabaseAdmin()
    .from("documents")
    .delete()
    .eq("id", id); // chunks cascade
  if (error) return Response.json({ error: "Delete failed" }, { status: 500 });
  return Response.json({ ok: true });
}
