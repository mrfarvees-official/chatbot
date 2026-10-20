import { requireUser, unauthorized } from "@/lib/auth";
import { deleteChatSession, getChatMessages, replaceChatMessages } from "@/lib/chat-history";
import { parseHistoryMessages } from "@/lib/chat-handler";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Context) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  const messages = getChatMessages(user.id, id);
  if (!messages) return Response.json({ error: "Chat session not found" }, { status: 404 });
  return Response.json({ messages });
}

export async function PUT(req: Request, context: Context) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const messages = parseHistoryMessages(body?.messages);
  if (!messages) return Response.json({ error: "Invalid chat history" }, { status: 400 });
  const title = typeof body?.title === "string" ? body.title : undefined;
  if (!replaceChatMessages(user.id, id, messages, title))
    return Response.json({ error: "Chat session not found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, context: Context) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!deleteChatSession(user.id, id)) return Response.json({ error: "Chat session not found" }, { status: 404 });
  return Response.json({ ok: true });
}
