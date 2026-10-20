import { requireUser, unauthorized } from "@/lib/auth";
import { createChatSession, listChatSessions } from "@/lib/chat-history";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  return Response.json({ sessions: listChatSessions(user.id) });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title : "New conversation";
  return Response.json({ session: createChatSession(user.id, title) }, { status: 201 });
}
