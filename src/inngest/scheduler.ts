/**
 * Scheduled publishing.
 *
 * Three Inngest cron functions:
 *
 *   1. scheduledPublisher (every 5 min) — drains the larger window of
 *      drafts whose scheduledFor is in the past. Honours a configurable
 *      batch size (default 50) and per-site rate-limit pauses recorded
 *      by cms-client when X-RateLimit-Remaining drops low or a 429 was
 *      received with Retry-After.
 *
 *   2. dueSoonPublisher (every 1 min, 60s lookahead) — gives near-realtime
 *      publishing without paying the full DB cost on the larger window.
 *      Picks up drafts due in the next 60 seconds. Tiny batch.
 *
 *   3. publishingDeadletter (every 5 min) — drafts stuck in `publishing`
 *      for >15 minutes are flipped back to `scheduled` with
 *      `scheduledFor = now + 5min`. Saves a draft from getting wedged
 *      when publish-draft crashes mid-flight.
 */

import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { drafts, jobs, sites } from "@/db/schema";
import { env } from "@/lib/env";
import { eq, lte, gte, and, isNull, or, inArray, sql } from "drizzle-orm";

const PUBLISHING_STUCK_AFTER_MS = 15 * 60 * 1000;
const REQUEUE_DELAY_MS = 5 * 60 * 1000;

/**
 * Pick the set of site IDs that are currently allowed to receive new
 * publishes. A site is paused when rate_limit_paused_until is in the
 * future (set by cms-client when the CMS responds with low rate-limit
 * headroom or a 429 + Retry-After).
 */
async function activeSiteIds(): Promise<string[] | null> {
  const rows = await db
    .select({ id: sites.id })
    .from(sites)
    .where(
      and(
        eq(sites.status, "active"),
        or(
          isNull(sites.rateLimitPausedUntil),
          lte(sites.rateLimitPausedUntil, new Date())
        )
      )
    );
  if (rows.length === 0) return null;
  return rows.map((r) => r.id);
}

/**
 * Enqueue a single draft. Atomically flips its status from `scheduled`
 * to `publishing` so two concurrent ticks (e.g. the 5-min + 1-min crons
 * firing within seconds) can't double-enqueue the same draft.
 */
async function enqueueOne(draftId: string): Promise<boolean> {
  // Conditional UPDATE: only flip to publishing if still scheduled. The
  // returning() row tells us whether this tick "won" the draft.
  const claimed = await db
    .update(drafts)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(and(eq(drafts.id, draftId), eq(drafts.status, "scheduled")))
    .returning({ id: drafts.id });

  if (claimed.length === 0) return false; // already claimed by another tick

  const [job] = await db
    .insert(jobs)
    .values({ kind: "publish-draft", status: "queued", inputId: draftId })
    .returning({ id: jobs.id });

  await inngest.send({
    name: "draft/publish",
    data: { draftId, jobId: job.id },
  });
  return true;
}

/**
 * Find scheduled drafts due now (or earlier) restricted to sites that
 * aren't currently rate-limit-paused. limit defaults to env-configured
 * batch size; pass a smaller value for the near-realtime fast cron.
 */
async function findDueScheduledDrafts(opts: {
  upperBound: Date;
  limit: number;
}): Promise<Array<{ id: string }>> {
  const allowedSites = await activeSiteIds();
  if (allowedSites === null) {
    // No active sites at all — nothing to do.
    return [];
  }

  return db
    .select({ id: drafts.id })
    .from(drafts)
    .where(
      and(
        eq(drafts.status, "scheduled"),
        lte(drafts.scheduledFor, opts.upperBound),
        // Drafts that have no targetSiteId can't be published — skip them.
        inArray(drafts.targetSiteId, allowedSites)
      )
    )
    .orderBy(drafts.scheduledFor)
    .limit(opts.limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. scheduledPublisher — every 5 min, full backlog drain
// ─────────────────────────────────────────────────────────────────────────────

export const scheduledPublisher = inngest.createFunction(
  {
    id: "scheduled-publisher",
    name: "Scheduled Publisher",
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const due = await step.run("find-due-drafts", async () =>
      findDueScheduledDrafts({
        upperBound: new Date(),
        limit: env.SCHEDULER_BATCH_SIZE,
      })
    );

    if (due.length === 0) {
      return { processed: 0 };
    }

    let processed = 0;
    for (const draft of due) {
      const enqueued = await step.run(`enqueue-publish-${draft.id}`, () =>
        enqueueOne(draft.id)
      );
      if (enqueued) processed++;
    }

    return { processed, scanned: due.length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. dueSoonPublisher — every 1 min, 60-second lookahead
// ─────────────────────────────────────────────────────────────────────────────

export const dueSoonPublisher = inngest.createFunction(
  {
    id: "due-soon-publisher",
    name: "Due Soon Publisher (60s lookahead)",
    triggers: [{ cron: "* * * * *" }],
  },
  async ({ step }) => {
    // 60-second lookahead — anything due in the next minute publishes now
    // instead of waiting for the 5-min tick. Use a tiny batch since a
    // 60-second window should never have many drafts.
    const upperBound = new Date(Date.now() + 60_000);
    const due = await step.run("find-due-soon-drafts", async () =>
      findDueScheduledDrafts({
        upperBound,
        limit: env.SCHEDULER_DUE_SOON_BATCH_SIZE,
      })
    );

    if (due.length === 0) return { processed: 0 };

    let processed = 0;
    for (const draft of due) {
      const enqueued = await step.run(`enqueue-publish-${draft.id}`, () =>
        enqueueOne(draft.id)
      );
      if (enqueued) processed++;
    }
    return { processed, scanned: due.length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. publishingDeadletter — every 5 min, recover stuck drafts
// ─────────────────────────────────────────────────────────────────────────────

export const publishingDeadletter = inngest.createFunction(
  {
    id: "publishing-deadletter",
    name: "Publishing Deadletter (15m stuck)",
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    // Drafts in `publishing` that haven't been updated in 15 min are
    // assumed stuck (publish-draft crashed mid-flight, Inngest gave up,
    // or some external dependency hung past the timeout). Flip them back
    // to `scheduled` with scheduledFor = now + 5min so the scheduler
    // picks them up on the next tick. publishAttempts is already tracked
    // by publish-draft so we don't bump it here — the count will resume
    // from where it left off on the next attempt.
    const cutoff = new Date(Date.now() - PUBLISHING_STUCK_AFTER_MS);
    const requeueAt = new Date(Date.now() + REQUEUE_DELAY_MS);

    const requeued = await step.run("requeue-stuck", async () => {
      const rows = await db
        .update(drafts)
        .set({
          status: "scheduled",
          scheduledFor: requeueAt,
          updatedAt: new Date(),
          failureReason: sql`COALESCE(${drafts.failureReason}, 'Recovered from stuck publishing state')`,
        })
        .where(
          and(
            eq(drafts.status, "publishing"),
            lte(drafts.updatedAt, cutoff),
            gte(drafts.publishAttempts, 0) // no-op condition; keeps the join shape consistent
          )
        )
        .returning({ id: drafts.id });
      return rows.length;
    });

    return { requeued };
  }
);
