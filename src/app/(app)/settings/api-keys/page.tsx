export const dynamic = "force-dynamic";

import { CheckCircle2, XCircle } from "lucide-react";

interface KeyInfo {
  label: string;
  envVar: string;
  isSet: boolean;
}

export default function ApiKeysPage() {
  // Read env vars directly so this page stays server-only without triggering
  // the Zod schema validation in lib/env.ts during build-time static collection.
  const keys: KeyInfo[] = [
    {
      label: "OpenAI API Key",
      envVar: "OPENAI_API_KEY",
      isSet: (process.env.OPENAI_API_KEY ?? "") !== "",
    },
    {
      label: "Pexels API Key",
      envVar: "PEXELS_API_KEY",
      isSet: (process.env.PEXELS_API_KEY ?? "") !== "",
    },
    {
      label: "Gemini API Key",
      envVar: "GEMINI_API_KEY",
      isSet: (process.env.GEMINI_API_KEY ?? "") !== "",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          API Keys
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage third-party API credentials
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Environment Variables
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          API keys are set via environment variables in your{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
            .env.local
          </code>{" "}
          file. After editing, restart the dev server to pick up changes.
        </p>

        <div className="divide-y divide-border rounded-md border border-border">
          {keys.map((key) => (
            <div
              key={key.envVar}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {key.label}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {key.envVar}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {key.isSet ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-xs font-medium text-green-500">
                      Set
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-xs font-medium text-red-500">
                      Not set
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          How to add keys (Vercel)
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Go to your project on{" "}
            <a
              href="https://vercel.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              vercel.com
            </a>
            {" "}→ <strong className="text-foreground">Settings</strong> → <strong className="text-foreground">Environment Variables</strong>.
          </li>
          <li>
            Add the variable (e.g.{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
              OPENAI_API_KEY
            </code>
            ) and set the value. Choose <strong className="text-foreground">All Environments</strong>.
          </li>
          <li>
            Click <strong className="text-foreground">Save</strong>, then go to{" "}
            <strong className="text-foreground">Deployments</strong> → <strong className="text-foreground">Redeploy</strong> so the new key is picked up.
          </li>
        </ol>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Also needed: Inngest (background jobs)
        </h2>
        <p className="text-sm text-muted-foreground">
          The pipeline, scheduler, and publishing all run as background jobs via Inngest.
          Add <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">INNGEST_EVENT_KEY</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">INNGEST_SIGNING_KEY</code> from{" "}
          <a
            href="https://app.inngest.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            app.inngest.com
          </a>
          , then sync your app endpoint:{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
            https://content-network-os.vercel.app/api/inngest
          </code>
        </p>
      </div>
    </div>
  );
}
