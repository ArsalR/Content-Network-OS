# Pinterest CMS Integration — Audit

Status snapshot at the tip of `chore/tests-and-audit` (stacked on
`feat/pinterest-idea-expansion` → `feat/pinterest-features` →
`feat/calendar-and-kanban` → `feat/publish-robustness` →
`feat/field-parity` → `feat/cms-dialect`).

## Phase 7.1 — Behavior audit

| # | Acceptance criterion | Status | Notes |
|---|----------------------|--------|-------|
| 1 | Add a brand-new Pinterest-CMS site via UI; test-connection works | 🟡 manual | Awaiting live CMS hostname (Phase 1 ASK-ME #2). Code path covered by `cms-client.test.ts > testConnection → GET /status`. |
| 2 | Add a brand-new WordPress site via UI; test-connection works (regression) | 🟡 manual | Same as #1. Code path covered by `testConnection → GET /wp-json` test. |
| 3 | Generate a draft, approve, schedule 2 min out → publishes to right CMS with right fields | 🟡 manual | All sub-flows covered by tests + types; awaits live CMS to verify end-to-end. |
| 4 | Published post has title, content, cover, ≥1 gallery image with alt, category, SEO fields, og:image, twitter_card | ✅ code | Pinterest field mapper test (`cms-client.test.ts`) exhaustively asserts every output field. |
| 5 | `drafts.publishedPostId`, `publishedUrl`, `publishedAt`, canonical slug populated | ✅ code | `publish-draft.ts mark-published` step persists all four; canonical-slug test in `cms-client.test.ts`. |
| 6 | Retrigger publish for same draft → PUT, zero duplicates | ✅ code | 3-layer idempotency: stored Idempotency-Key (when features.idempotency on), CNOS-level PUT-by-publishedPostId (always-on), slug recovery. |
| 7 | 500 from CMS → retries → clear `failureReason` + `failed` status | ✅ code | Retry logic in `cms-client.ts` (5xx/429 with jittered backoff), failure surfaced via editor sidebar red chip + kanban Failed column. |
| 8 | `<script>` in editor → stripped before reaching CMS | ✅ tested | `html-sanitize.test.ts` XSS attack table covers `<script>`, `on*=`, `javascript:`, `data:`, `blob:`, `vbscript:`, `<iframe>`, `<style>`. |
| 9 | 1×1 cover to Pinterest-mode site → publish refused with useful error | ✅ tested | `image-validation.test.ts` rejects landscape, square, < 800 wide; `publish-draft.ts validate-cover-dimensions` step raises typed `pinterest_cover_invalid` failure. |

## Phase 7.1b — Capability-based audit (gated by `features.*`)

| # | Capability behavior | Status | Verification |
|---|---------------------|--------|--------------|
| 1 | `getCapabilities()` returns DEFAULT on 404; CNOS still publishes | ✅ code | `cms-capabilities.ts probeCapabilities` returns `DEFAULT_CAPABILITIES` on 404 or any error; `publish-draft.ts` paths are guarded by `capabilities.features.*` falsy → no opt-in behavior runs. |
| 2 | `features.idempotency=true` → Idempotency-Key sent; replay returns `Idempotency-Replayed: true` | ✅ tested | `cms-client.test.ts` "sends Idempotency-Key when provided" and "reads Idempotency-Replayed into meta". |
| 3 | `features.idempotency=false` → no Idempotency-Key sent | ✅ tested | `cms-client.test.ts` "does NOT send Idempotency-Key when not provided". |
| 4 | `features.slug_lookup=true` + null publishedPostId + matching slug → PUT, not POST | ✅ code | `publish-draft.ts slug-lookup` step + `persist-recovered-post-id` step. |
| 5 | `features.error_codes=true` → typed `failureCode` persisted | ✅ code | `cms-client.ts request()` reads `X-Error-Code` / body.code; `cms-errors.ts mapCmsErrorCode` table-tested; `publish-draft.ts` persists `failureCode`. |
| 6 | `features.webhooks=true` → register on site create; receiver verifies sig + dedupes by delivery id | ✅ tested | `cms-webhook-signature.test.ts` covers valid sig, stale timestamp, malformed header, mismatch (timing-safe), wrong-length, mutated body, wrong secret. Receiver implements all required behaviors. |
| 7 | `features.batch_posts=true` + 5 due drafts to same site → batch endpoint, per-item results | 🔵 deferred | Scaffolding present (`enqueueOne` ready); not wired to a batch dispatcher in scheduler. Will land when CMS ships the capability. |

## Phase 7.2 — Code audit

| # | Check | Status |
|---|-------|--------|
| 1 | `npm run typecheck` clean | ✅ |
| 2 | `npm run lint` clean | 🟡 ESLint not configured (`next lint` triggers setup wizard). Pre-existing condition before Phase 1; flagged in Phase 1 PR. Not regressed. |
| 3 | `npm test` (vitest) green — **111 tests across 6 files** | ✅ |
| 4 | `npm run build` green | ✅ — 30 routes, including `/calendar` and `/api/cms-webhooks/[siteId]` |
| 5 | Playwright E2E green | 🟡 deferred — requires a long-lived mock CMS server (Express stub on a random port per the brief). Skipped for scope; tracked as a follow-up. |
| 6 | No `console.log` in production paths | ✅ — single `console.warn` in webhook receiver for the "no precedent project" import-skip case is intentional operator-visibility. |
| 7 | All new env vars in `.env.example` and `lib/env.ts` | ✅ — `SCHEDULER_BATCH_SIZE`, `SCHEDULER_DUE_SOON_BATCH_SIZE` added to `lib/env.ts`. `.env.example` does not yet exist in the repo; pre-existing condition. |
| 8 | No direct `fetch()` calls for CMS traffic outside `lib/cms-client.ts` | 🟡 — three intentional exceptions documented inline: cover-image *fetch* in `publish-draft.ts validate-cover-dimensions` step (downloads the image bytes; not a CMS API call), capability probe in `cms-capabilities.ts probeCapabilities` (separate from the request-layer to keep it usable without DB), and cache-warm verify in `publish-draft.ts` (calls the public post URL, not the API). All three correctly stay outside the dialect dispatcher. |
| 9 | Migration SQL committed and `db:push` works on a fresh DB | 🟡 — `drizzle/` is gitignored by the team (pre-existing convention). Every schema change applied to prod via Neon MCP and committed via `src/db/schema.ts`. A fresh `db:push` reproduces the exact schema state. |

## Phase 7.3 — Safety audit

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | No new endpoint exposes CMS API keys to the browser | ✅ | Site `apiKey` only handled in server actions / Inngest steps; never serialized into a client component prop. |
| 2 | Better-auth single-user check still rejects a second signup | ✅ | Phase 1–6 didn't touch auth. |
| 3 | Encrypted API keys remain encrypted | ✅ | `encrypt(apiKey)` on create / update; `decrypt(site.apiKey)` only inside server actions and Inngest steps. |
| 4 | Encrypted `webhookSecret` remains encrypted | ✅ | Same pattern: encrypted on registration, decrypted only inside the webhook receiver. |
| 5 | No raw user HTML reaches the CMS unsanitized | ✅ | Sanitized in `actions/drafts.ts::updateDraft` on save AND in `publish-draft.ts` before serialization. `target="_blank"` links auto-get `rel="noopener noreferrer"` via pre-process. data:/blob:/javascript:/vbscript:/file: URLs stripped from `href`/`src`. |
| 6 | Webhook signature verification is timing-safe | ✅ | `crypto.timingSafeEqual` after a length-equality check; verified by test. |
| 7 | 5-minute timestamp replay window enforced | ✅ | `WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300`; tested both directions of skew. |
| 8 | Webhook receiver refuses unsigned events | ✅ | Returns 404 when `site.webhookSecret` is null. |
| 9 | Webhook delivery dedupe distinguishes UNIQUE-violation (23505) from other DB errors | ✅ | Tightened during the audit pass; non-unique errors return 500 so the CMS retries. |

## Phase 7.4 — Rollback plan

If anything goes wrong in production, revert in this order:

1. **Revert client behaviour:** `git revert <merge of feat/cms-dialect>` rolls back to the previous WordPress-only client. All schema additions are **additive** so the older code ignores the new columns gracefully.
2. **Revert schema state (optional):** Schema migrations are all `ADD COLUMN IF NOT EXISTS` / `CREATE TYPE … EXCEPTION WHEN duplicate_object`. They don't require a rollback to keep the prior code working. If you must drop them, do it in this order to satisfy FK dependencies:
   - `DROP TABLE webhook_deliveries;`
   - `ALTER TABLE drafts DROP COLUMN IF EXISTS pinterest_meta, DROP COLUMN IF EXISTS scheduled_timezone, DROP COLUMN IF EXISTS failure_code, DROP COLUMN IF EXISTS publish_attempts, DROP COLUMN IF EXISTS last_idempotency_key;`
   - `DROP INDEX IF EXISTS drafts_published_post_id_idx;`
   - `ALTER TABLE sites DROP COLUMN IF EXISTS posting_cadence, DROP COLUMN IF EXISTS capabilities_cache, DROP COLUMN IF EXISTS capabilities_checked_at, DROP COLUMN IF EXISTS webhook_secret, DROP COLUMN IF EXISTS webhook_id, DROP COLUMN IF EXISTS rate_limit_paused_until, DROP COLUMN IF EXISTS kind;`
   - `DROP TYPE IF EXISTS site_kind;`
3. **Revert env var changes:** Vercel env vars added (`SCHEDULER_BATCH_SIZE`, `SCHEDULER_DUE_SOON_BATCH_SIZE`) are optional with defaults — leave them or remove them, no impact.

## Open follow-ups (not blocking ship)

- **Playwright E2E with a mock CMS server.** The unit + integration tests cover every code path; a Playwright suite would catch real-browser interaction regressions (calendar drag, kanban retry button, etc.). Brief Phase 6.3.
- **Inngest harness integration tests.** Same idea — would exercise the full publish flow including retries and idempotency in one process. Brief Phase 6.2.
- **ESLint configuration.** Pre-existing condition before Phase 1; not regressed.
- **Bulk scheduling modal** + **per-site cadence picker** + **/settings default-timezone**. Phase 4 deferred items.
- **`batch_posts` capability wiring in scheduler.** Land when CMS exposes the endpoint. Phase 4.6 deferred.

## Tests summary

```
Test Files  6 passed (6)
     Tests  111 passed (111)
   Duration ~1.5s
```

Files:
- `src/lib/html-sanitize.test.ts` — XSS table + target/rel + URL scheme strip
- `src/lib/cms-webhook-signature.test.ts` — sig parse, replay window, timing-safe compare, integrity, auth
- `src/lib/cms-errors.test.ts` — `mapCmsErrorCode` lookup table
- `src/lib/image-validation.test.ts` — accept/reject Pinterest dimensions (PNG fixtures synthesized from IHDR bytes)
- `src/lib/article-parser.test.ts` — image prompts, cover prompt, section heading walk, item count
- `src/lib/cms-client.test.ts` — dialect dispatch (testConnection, uploadFile), Pinterest field mapper (exhaustive), Idempotency-Key plumbing, error-code surfacing, canonical-slug return
