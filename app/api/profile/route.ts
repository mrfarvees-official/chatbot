import { requireUser, unauthorized } from "@/lib/auth";
import { getSupabaseAuth } from "@/lib/supabase-auth";

const fields = ["first_name", "last_name", "mobile_number"] as const;
type ProfileField = (typeof fields)[number];

function clean(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value.trim().slice(0, 200) : undefined;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const supabase = await getSupabaseAuth();
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name, last_name, full_name, mobile_number, updated_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    email: user.email,
    profile: data ?? { first_name: null, last_name: null, full_name: null, mobile_number: null },
  });
}

export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return Response.json({ error: "Invalid profile" }, { status: 400 });

  const values: Partial<Record<ProfileField, string | null>> = {};
  for (const field of fields) {
    const value = clean((body as Record<string, unknown>)[field]);
    if (value === undefined)
      return Response.json({ error: `${field} must be text` }, { status: 400 });
    values[field] = value;
  }

  const fullName = [values.first_name, values.last_name]
    .filter((value): value is string => Boolean(value))
    .join(" ") || null;

  const supabase = await getSupabaseAuth();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...values, full_name: fullName, updated_at: new Date().toISOString() })
    .select("first_name, last_name, full_name, mobile_number, updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ profile: data });
}
