import "server-only";
import { randomUUID } from "node:crypto";
import { db, sql } from "./local-db";
import type { ChatMessage } from "./llm";

export type ChatSessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type StoredChatMessage = ChatMessage & { createdAt: string };

function ownedSession(userId: string, sessionId: string) {
  return db.get<{ id: string; title: string }>(sql`
    select id, title from chat_sessions where id = ${sessionId} and user_id = ${userId}
  `);
}

export function listChatSessions(userId: string): ChatSessionSummary[] {
  return db.all<ChatSessionSummary>(sql`
    select s.id, s.title, s.created_at as createdAt, s.updated_at as updatedAt,
      count(m.id) as messageCount
    from chat_sessions s
    left join chat_messages m on m.session_id = s.id
    where s.user_id = ${userId}
    group by s.id
    order by s.updated_at desc
  `).map((row) => ({ ...row, messageCount: Number(row.messageCount) }));
}

export function createChatSession(userId: string, title = "New conversation") {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.run(sql`
    insert into chat_sessions (id, user_id, title, created_at, updated_at)
    values (${id}, ${userId}, ${title.trim().slice(0, 120) || "New conversation"}, ${now}, ${now})
  `);
  return { id, title: title.trim().slice(0, 120) || "New conversation", createdAt: now, updatedAt: now, messageCount: 0 };
}

export function getChatMessages(userId: string, sessionId: string): StoredChatMessage[] | null {
  if (!ownedSession(userId, sessionId)) return null;
  return db.all<{ message_json: string; created_at: string }>(sql`
    select message_json, created_at from chat_messages where session_id = ${sessionId} order by position asc
  `).flatMap((row) => {
    try {
      const message = JSON.parse(row.message_json) as ChatMessage;
      return [{ ...message, createdAt: row.created_at }];
    } catch {
      return [];
    }
  });
}

export function replaceChatMessages(userId: string, sessionId: string, messages: ChatMessage[], title?: string) {
  const session = ownedSession(userId, sessionId);
  if (!session) return false;
  const now = new Date().toISOString();
  const existing = new Map(db.all<{ position: number; created_at: string }>(sql`
    select position, created_at from chat_messages where session_id = ${sessionId}
  `).map((row) => [row.position, row.created_at] as const));
  db.transaction((tx) => {
    tx.run(sql`delete from chat_messages where session_id = ${sessionId}`);
    messages.forEach((message, position) => {
      tx.run(sql`
        insert into chat_messages (session_id, position, message_json, created_at)
        values (${sessionId}, ${position}, ${JSON.stringify(message)}, ${existing.get(position) ?? now})
      `);
    });
    if (title !== undefined) {
      tx.run(sql`update chat_sessions set title = ${title.trim().slice(0, 120) || "New conversation"}, updated_at = ${now} where id = ${sessionId}`);
    } else {
      tx.run(sql`update chat_sessions set updated_at = ${now} where id = ${sessionId}`);
    }
  });
  return true;
}

export function deleteChatSession(userId: string, sessionId: string) {
  const result = db.run(sql`delete from chat_sessions where id = ${sessionId} and user_id = ${userId}`);
  return result.changes > 0;
}
