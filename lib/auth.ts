import "server-only";
import { getLocalUser, isAllowedEmail } from "./local-auth";

export { isAllowedEmail };

export async function requireAdmin() {
  const user = await requireUser();
  return user && (user.isAdmin || isAllowedEmail(user.email)) ? user : null;
}

export async function requireUser() {
  return getLocalUser();
}

export const unauthorized = () =>
  Response.json({ error: "Unauthorized" }, { status: 401 });
