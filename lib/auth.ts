import "server-only";
import { getSupabaseAuth } from "./supabase-auth";

const allowlist = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const isAllowedEmail = (email: string) =>
  allowlist().includes(email.trim().toLowerCase());

// Always validates with Supabase (getUser), never trusts the cookie alone.
export async function requireAdmin() {
  const supabase = await getSupabaseAuth();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email || !user.email_confirmed_at || !isAllowedEmail(user.email))
    return null;
  return user;
}

export const unauthorized = () =>
  Response.json({ error: "Unauthorized" }, { status: 401 });
