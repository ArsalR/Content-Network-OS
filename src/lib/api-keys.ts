/**
 * Third-party API key resolver.
 *
 * Keys can be set in two places:
 *   1. The /settings/api-keys UI — stored encrypted in app_settings
 *   2. Vercel env vars (the legacy / fallback path)
 *
 * Resolution order: DB → env. This way an existing env-var deploy keeps
 * working unchanged, and a user can override per-deployment via the UI
 * without touching Vercel. The DB row is encrypted via lib/crypto
 * (AES-256-GCM) so the raw key never sits in plaintext at rest.
 */

import { db } from "@/lib/db";
import { appSettings } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { eq } from "drizzle-orm";

export const MANAGED_API_KEYS = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "PEXELS_API_KEY",
] as const;

export type ManagedApiKey = (typeof MANAGED_API_KEYS)[number];

/**
 * Resolve a managed API key. Returns empty string when neither DB nor
 * env has a value — callers should check for empty and surface a clear
 * "key not configured" error to the user.
 */
export async function getApiKey(envVar: ManagedApiKey): Promise<string> {
  try {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, envVar),
    });
    if (row?.value) {
      const decrypted = decrypt(row.value);
      if (decrypted) return decrypted;
    }
  } catch {
    // DB unreachable / row missing / decrypt failure — fall through to env.
  }
  return process.env[envVar] ?? "";
}

/**
 * Per-key resolution source — useful for the settings UI to show whether
 * a key is coming from the DB ("set via UI"), env ("set via Vercel"),
 * or unset.
 */
export type ApiKeySource = "db" | "env" | "unset";

export async function getApiKeySource(
  envVar: ManagedApiKey
): Promise<ApiKeySource> {
  try {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, envVar),
    });
    if (row?.value) return "db";
  } catch {
    /* fall through */
  }
  if (process.env[envVar] && process.env[envVar] !== "") return "env";
  return "unset";
}
