export const runtime = "nodejs";
export const maxDuration = 60;

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import {
  generateDraft,
  publishDraft,
  scheduledPublisher,
  dueSoonPublisher,
  publishingDeadletter,
  generateDraftWithImages,
} from "@/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateDraft,
    publishDraft,
    scheduledPublisher,
    dueSoonPublisher,
    publishingDeadletter,
    generateDraftWithImages,
  ],
});
