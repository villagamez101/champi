import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { UPLOADS_DIR, type Part, type StoredMessage } from "./db";

const BASE_URL = process.env.GO_BASE_URL || "https://opencode.ai/zen/go/v1";
const USER_AGENT = process.env.GO_USER_AGENT || "eduardo-chat/1.0";

export interface UpstreamMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<Record<string, unknown>>;
}

let modelsCache: { at: number; data: unknown } | null = null;

export async function listModels(): Promise<unknown> {
  if (modelsCache && Date.now() - modelsCache.at < 1000 * 60 * 60) {
    return modelsCache.data;
  }
  const res = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey()}`, "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`models: ${res.status} ${await res.text()}`);
  const data = await res.json();
  modelsCache = { at: Date.now(), data };
  return data;
}

function apiKey(): string {
  const key = process.env.OPENCODE_GO_API_KEY;
  if (!key) throw new Error("OPENCODE_GO_API_KEY no está configurada");
  return key;
}

function imageToDataUrl(url: string, mime: string): string {
  const name = basename(url);
  const bytes = readFileSync(join(UPLOADS_DIR, name));
  return `data:${mime || "image/png"};base64,${bytes.toString("base64")}`;
}

export function buildUpstreamMessages(history: StoredMessage[]): UpstreamMessage[] {
  return history.map((msg) => {
    const images = msg.content.filter((p): p is Extract<Part, { type: "image" }> => p.type === "image");
    const texts = msg.content.filter((p): p is Extract<Part, { type: "text" }> => p.type === "text");
    const text = texts.map((p) => p.text).join("\n");
    if (images.length === 0) {
      return { role: msg.role, content: text };
    }
    return {
      role: msg.role,
      content: [
        ...(text ? [{ type: "text", text }] : []),
        ...images.map((img) => ({
          type: "image_url",
          image_url: { url: imageToDataUrl(img.url, img.mime) },
        })),
      ],
    };
  });
}

export async function chatStream(opts: {
  model: string;
  messages: UpstreamMessage[];
  sessionId: string;
  signal: AbortSignal;
}): Promise<Response> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "x-opencode-session": opts.sessionId,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenCode Go respondió ${res.status}: ${detail.slice(0, 500)}`);
  }
  return res;
}
