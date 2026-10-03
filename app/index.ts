import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "hono/bun";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

import {
  UPLOADS_DIR,
  addMessage,
  countUserMessages,
  createConversation,
  deleteConversation,
  getConversation,
  getMessages,
  listConversations,
  renameConversation,
  setConversationModel,
  type Part,
} from "./db";
import { buildUpstreamMessages, chatStream, listModels } from "./opencode";
import {
  COOKIE_MAX_AGE,
  COOKIE_NAME,
  checkPassword,
  createToken,
  passwordConfigured,
  verifyToken,
} from "./auth";

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "deepseek-v4.1-flash";
const PUBLIC_DIR = join(import.meta.dir, "public");
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const SAFE_FILE = /^[a-f0-9-]+\.(png|jpg|jpeg|webp|gif)$/;

const app = new Hono();

app.use("/api/*", async (c, next) => {
  const path = c.req.path;
  if (path === "/api/login" || path === "/api/session" || path === "/api/health") {
    return next();
  }
  if (!verifyToken(getCookie(c, COOKIE_NAME))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/session", (c) =>
  c.json({
    authed: !passwordConfigured() || verifyToken(getCookie(c, COOKIE_NAME)),
    passwordRequired: passwordConfigured(),
  }),
);

app.post("/api/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!checkPassword(String(body.password ?? ""))) {
    return c.json({ error: "Contraseña incorrecta" }, 401);
  }
  setCookie(c, COOKIE_NAME, createToken(), {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.COOKIE_SECURE !== "false",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return c.json({ ok: true });
});

app.post("/api/logout", (c) => {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/models", async (c) => {
  try {
    return c.json(await listModels());
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

app.get("/api/conversations", (c) => c.json(listConversations()));

app.post("/api/conversations", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(createConversation(body.model || DEFAULT_MODEL));
});

app.get("/api/conversations/:id", (c) => {
  const conv = getConversation(c.req.param("id"));
  if (!conv) return c.json({ error: "not found" }, 404);
  return c.json({ ...conv, messages: getMessages(conv.id) });
});

app.patch("/api/conversations/:id", async (c) => {
  const id = c.req.param("id");
  if (!getConversation(id)) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.title === "string") renameConversation(id, body.title.slice(0, 200));
  if (typeof body.model === "string") setConversationModel(id, body.model);
  return c.json(getConversation(id));
});

app.delete("/api/conversations/:id", (c) => {
  deleteConversation(c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/api/conversations/:id/messages", async (c) => {
  const id = c.req.param("id");
  const conv = getConversation(id);
  if (!conv) return c.json({ error: "not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const model: string = typeof body.model === "string" ? body.model : conv.model;
  const incoming: Array<{ type: string; text?: string; dataUrl?: string; mime?: string }> =
    Array.isArray(body.parts) ? body.parts : [];

  const parts: Part[] = [];
  for (const p of incoming) {
    if (p.type === "text" && p.text?.trim()) {
      parts.push({ type: "text", text: p.text });
    } else if (p.type === "image" && p.dataUrl) {
      const saved = saveDataUrl(p.dataUrl, p.mime);
      if (saved) parts.push({ type: "image", url: `/api/files/${saved.name}`, mime: saved.mime });
    }
  }
  if (parts.length === 0) return c.json({ error: "Mensaje vacío" }, 400);

  addMessage(id, "user", parts);
  if (conv.title === "Nueva conversación" && countUserMessages(id) === 1) {
    const text = parts.find((p) => p.type === "text") as { text: string } | undefined;
    if (text) renameConversation(id, text.text.slice(0, 60));
  }
  if (model !== conv.model) setConversationModel(id, model);

  const history = getMessages(id);
  const upstreamMessages = buildUpstreamMessages(history);

  const controller = new AbortController();

  return streamSSE(c, async (stream) => {
    let full = "";
    let stopped = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), 60_000);
    };
    stream.onAbort(() => {
      stopped = true;
      controller.abort();
    });
    try {
      const upstream = await chatStream({
        model,
        messages: upstreamMessages,
        sessionId: id,
        signal: controller.signal,
      });
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      armIdle();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        armIdle();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              full += delta;
              await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: delta }) });
            }
          } catch {
            /* ignore keep-alive / partial frames */
          }
        }
      }
      const messageId = addMessage(id, "assistant", [{ type: "text", text: full || "(sin respuesta)" }]);
      await stream.writeSSE({ event: "done", data: JSON.stringify({ messageId, content: full }) });
    } catch (err) {
      if (full) addMessage(id, "assistant", [{ type: "text", text: full }]);
      const aborted = (err as Error).name === "AbortError";
      const message = aborted
        ? stopped
          ? "Generación detenida"
          : "La respuesta tardó demasiado, inténtalo de nuevo"
        : (err as Error).message;
      console.error("[chat] error:", (err as Error).message);
      try {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: message }) });
      } catch {
        /* client already gone */
      }
    } finally {
      clearTimeout(idleTimer);
    }
  });
});

app.get("/api/files/:name", (c) => {
  const name = c.req.param("name");
  if (!SAFE_FILE.test(name)) return c.json({ error: "bad name" }, 400);
  const file = Bun.file(join(UPLOADS_DIR, name));
  return new Response(file, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
});

function saveDataUrl(dataUrl: string, fallbackMime?: string): { name: string; mime: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = MIME_EXT[match[1]] ? match[1] : fallbackMime && MIME_EXT[fallbackMime] ? fallbackMime : "image/png";
  const ext = MIME_EXT[mime];
  const name = `${crypto.randomUUID()}.${ext}`;
  writeFileSync(join(UPLOADS_DIR, name), Buffer.from(match[2], "base64"));
  return { name, mime };
}

app.use("/*", serveStatic({ root: PUBLIC_DIR }));
app.get("*", serveStatic({ path: join(PUBLIC_DIR, "index.html") }));

export default {
  port: Number(process.env.PORT) || 3000,
  idleTimeout: 0,
  fetch: app.fetch,
};
