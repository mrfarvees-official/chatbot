import { requireUser, unauthorized } from "@/lib/auth";
import { db, sql } from "@/lib/local-db";

const fields = ["first_name", "last_name", "mobile_number"] as const;
type ProfileField = (typeof fields)[number];

function clean(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value.trim().slice(0, 200) : undefined;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const data = db.get(sql`select first_name, last_name, full_name, mobile_number, updated_at from profiles where user_id = ${user.id}`);
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

  db.run(sql`update profiles set first_name = ${values.first_name ?? null}, last_name = ${values.last_name ?? null}, full_name = ${fullName}, mobile_number = ${values.mobile_number ?? null}, updated_at = ${new Date().toISOString()} where user_id = ${user.id}`);
  const data = db.get(sql`select first_name, last_name, full_name, mobile_number, updated_at from profiles where user_id = ${user.id}`);
  return Response.json({ profile: data });
}
