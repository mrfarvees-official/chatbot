import { handleChat } from "@/lib/chat-handler";
import { requireAdmin, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  return handleChat(req, "admin");
}