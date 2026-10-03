import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const PASSWORD = process.env.APP_PASSWORD || "";
export const COOKIE_NAME = "champi_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 30;

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passwordConfigured(): boolean {
  return PASSWORD.length > 0;
}

export function checkPassword(candidate: string): boolean {
  if (!passwordConfigured()) return true;
  return safeEqual(candidate, PASSWORD);
}

export function createToken(): string {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac) return false;
  if (!safeEqual(mac, sign(exp))) return false;
  return Number(exp) > Date.now();
}

export const COOKIE_MAX_AGE = Math.floor(TTL_MS / 1000);
