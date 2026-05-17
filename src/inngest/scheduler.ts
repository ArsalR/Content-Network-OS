import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { drafts, jobs } from "@/db/schema";
import { eq, lte, and } from "drizzle-orm";

export const scheduledPublisher = inngest.createFunction(
  { id: "scheduled-publisher", name: "Scheduled Publisher" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const due = await step.run("find-due-drafts", async () => {
      return db.query.drafts.findMany({
        where: and(eq(drafts.status, "scheduled"), lte(drafts.scheduledFor, new Date())),
        columns: { id: true },
        limit: 10,
      });
    });

    if (due.length === 0) {
      return { processed: 0 };
    }

    await step.run("enqueue-publishes", async () => {
      for (const draft of due) {
        const [job] = await db
          .insert(jobs)
          .values({
            kind: "publish-draft",
            status: "queued",
            inputId: draft.id,
          })
          .returning({ id: jobs.id });

        await inngest.send({
          name: "draft/publish",
          data: { draftId: draft.id, jobId: job.id },
        });
      }
    });

    return { processed: due.length };
  }
);
