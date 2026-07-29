import "server-only";

import { randomBytes } from "crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

type LocalSecrets = { dataEncryptionKey?: string; sessionSecret?: string };
const secretsPath = path.join(process.cwd(), "backend", "data", ".runtime-secrets.json");

let inMemorySecrets: LocalSecrets | null = null;

function localSecrets(): LocalSecrets {
  if (inMemorySecrets) return inMemorySecrets;
  const directory = path.dirname(secretsPath);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (existsSync(secretsPath)) {
      inMemorySecrets = JSON.parse(readFileSync(secretsPath, "utf8")) as LocalSecrets;
      return inMemorySecrets;
    }
    const secrets = { dataEncryptionKey: randomBytes(32).toString("hex"), sessionSecret: randomBytes(48).toString("base64url") };
    writeFileSync(secretsPath, JSON.stringify(secrets), { mode: 0o600 });
    chmodSync(secretsPath, 0o600);
    inMemorySecrets = secrets;
    return secrets;
  } catch (error) {
    if (!inMemorySecrets) {
      inMemorySecrets = { dataEncryptionKey: randomBytes(32).toString("hex"), sessionSecret: randomBytes(48).toString("base64url") };
    }
    return inMemorySecrets;
  }
}

export function serverSecret(environmentName: "DATA_ENCRYPTION_KEY" | "SESSION_SECRET") {
  const configured = process.env[environmentName];
  if (configured) return configured;
  const secrets = localSecrets();
  return environmentName === "DATA_ENCRYPTION_KEY" ? secrets.dataEncryptionKey! : secrets.sessionSecret!;
}

