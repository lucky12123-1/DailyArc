import "server-only";

import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { serverSecret } from "@/backend/runtime-secrets";

const scrypt = promisify(scryptCallback);
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = serverSecret("SESSION_SECRET");
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
  return value;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

export function createSession(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { value: `${payload}.${signature}`, maxAge: SESSION_MAX_AGE_SECONDS };
}

export function readSession(value?: string) {
  if (!value) return null;
  const [userId, expiresAtText, signature] = value.split(".");
  if (!userId || !expiresAtText || !signature) return null;
  const payload = `${userId}.${expiresAtText}`;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (Number(expiresAtText) < Math.floor(Date.now() / 1000)) return null;
  return userId;
}
