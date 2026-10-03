import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = process.env.DATA_DIR || "./data";
export const UPLOADS_DIR = join(DATA_DIR, "uploads");

mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "chat.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT 'Nueva conversación',
    model      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, id);
`);

export type Part =
  | { type: "text"; text: string }
  | { type: "image"; url: string; mime: string };

export interface StoredMessage {
  id: number;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: Part[];
  created_at: number;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: number;
  updated_at: number;
}

export function listConversations(): Conversation[] {
  return db
    .query("SELECT * FROM conversations ORDER BY updated_at DESC")
    .all() as Conversation[];
}

export function createConversation(model: string): Conversation {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO conversations (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, "Nueva conversación", model, now, now);
  return { id, title: "Nueva conversación", model, created_at: now, updated_at: now };
}

export function getConversation(id: string): Conversation | null {
  return (
    (db.query("SELECT * FROM conversations WHERE id = ?").get(id) as Conversation) ??
    null
  );
}

export function getMessages(conversationId: string): StoredMessage[] {
  const rows = db
    .query("SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC")
    .all(conversationId) as Omit<StoredMessage, "content"> & { content: string }[];
  return rows.map((r) => ({ ...r, content: JSON.parse(r.content) as Part[] }));
}

export function addMessage(
  conversationId: string,
  role: StoredMessage["role"],
  content: Part[],
): number {
  const now = Date.now();
  const res = db
    .query(
      "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(conversationId, role, JSON.stringify(content), now);
  db.query("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now, conversationId);
  return Number(res.lastInsertRowid);
}

export function renameConversation(id: string, title: string): void {
  db.query("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    Date.now(),
    id,
  );
}

export function setConversationModel(id: string, model: string): void {
  db.query("UPDATE conversations SET model = ? WHERE id = ?").run(model, id);
}

export function deleteConversation(id: string): void {
  db.query("DELETE FROM conversations WHERE id = ?").run(id);
}

export function countUserMessages(conversationId: string): number {
  const row = db
    .query("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND role = 'user'")
    .get(conversationId) as { n: number };
  return row.n;
}
