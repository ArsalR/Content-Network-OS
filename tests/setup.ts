/**
 * Vitest setup. Injects the env vars that lib/env.ts demands at module load
 * (DATABASE_URL, BETTER_AUTH_*, ENCRYPTION_KEY) so unit tests can import
 * any module without crashing on the env Zod validation.
 *
 * NOTHING here should touch a real DB or external service — tests mock
 * fetch / db explicitly when needed.
 */

process.env.DATABASE_URL ??= "postgresql://test-placeholder";
process.env.BETTER_AUTH_SECRET ??= "test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
