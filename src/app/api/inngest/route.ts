import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { generateDraft } from "@/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateDraft],
});
