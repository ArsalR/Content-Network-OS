"use server";

import { db } from "@/lib/db";
import { appSettings } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { MANAGED_API_KEYS, type ManagedApiKey, getApiKeySource } from "@/lib/api-keys";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

/**
 * Store a third-party API key from the Settings UI. Encrypted at rest
 * via lib/crypto (AES-256-GCM). NEVER returns the value; callers can
 * only check whether a key is set.
 */
export async function setApiKey(
  envVar: string,
  value: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(MANAGED_API_KEYS as readonly string[]).includes(envVar)) {
    return { ok: false, error: `Unknown key: ${envVar}` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: "Value can't be empty" };
  }
  try {
    const encrypted = encrypt(trimmed);
    await db
      .insert(appSettings)
      .values({
        key: envVar,
        value: encrypted,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: encrypted, updatedAt: new Date() },
      });
    revalidatePath("/settings/api-keys");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save key",
    };
  }
}

/**
 * Remove a UI-set API key. The env-var fallback (if any) becomes the
 * effective value again — no impact on existing Vercel env-var deploys.
 */
export async function clearApiKey(
  envVar: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(MANAGED_API_KEYS as readonly string[]).includes(envVar)) {
    return { ok: false, error: `Unknown key: ${envVar}` };
  }
  try {
    await db.delete(appSettings).where(eq(appSettings.key, envVar));
    revalidatePath("/settings/api-keys");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to clear key",
    };
  }
}

/**
 * Returns whether each managed key is set, and where the value comes
 * from. Never returns the value itself.
 */
export async function getApiKeyStatuses(): Promise<
  Array<{ envVar: ManagedApiKey; source: "db" | "env" | "unset" }>
> {
  const out: Array<{ envVar: ManagedApiKey; source: "db" | "env" | "unset" }> = [];
  for (const key of MANAGED_API_KEYS) {
    out.push({ envVar: key, source: await getApiKeySource(key) });
  }
  return out;
}
