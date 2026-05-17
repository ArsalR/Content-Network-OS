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
          How to configure
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Open{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
              .env.local
            </code>{" "}
            in the project root (create it if it doesn&apos;t exist).
          </li>
          <li>
            Add the variable, e.g.{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
              OPENAI_API_KEY=sk-…
            </code>
          </li>
          <li>Save the file and restart the dev server.</li>
        </ol>
      </div>
    </div>
  );
}
