import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { generateDraft, publishDraft, scheduledPublisher, generateDraftWithImages } from "@/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateDraft, publishDraft, scheduledPublisher, generateDraftWithImages],
});
