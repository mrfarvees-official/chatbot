import { getSupabaseAuth } from "@/lib/supabase-auth";

export async function POST() {
  const supabase = await getSupabaseAuth();
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
