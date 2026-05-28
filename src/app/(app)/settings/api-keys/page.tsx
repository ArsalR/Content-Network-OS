export const dynamic = "force-dynamic";

import { getApiKeyStatuses } from "@/actions/app-settings";
import { ApiKeyRow } from "@/components/settings/api-key-row";
import { ExternalLink } from "lucide-react";

const KEY_META: Record<
  string,
  { label: string; description: string; helpUrl: string; placeholder: string }
> = {
  OPENAI_API_KEY: {
    label: "OpenAI",
    description:
      "Powers article generation (ChatGPT) and DALL-E image generation. Required for the pipeline to produce drafts.",
    helpUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-…",
  },
  GEMINI_API_KEY: {
    label: "Google Gemini",
    description:
      "Optional alternative image provider (Imagen 3) — use only when a site's Image Provider is set to Gemini.",
    helpUrl: "https://aistudio.google.com/apikey",
    placeholder: "AIza…",
  },
  PEXELS_API_KEY: {
    label: "Pexels",
    description:
      "Optional stock photo provider for the editor's cover image picker.",
    helpUrl: "https://www.pexels.com/api/key",
    placeholder: "563492a…",
  },
};

export default async function ApiKeysPage() {
  const statuses = await getApiKeyStatuses();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          API Keys
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage third-party API credentials. Values are encrypted at rest and
          never leave the server.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {statuses.map((s) => {
          const meta = KEY_META[s.envVar] ?? {
            label: s.envVar,
            description: "",
            helpUrl: "",
            placeholder: "",
          };
          return (
            <ApiKeyRow
              key={s.envVar}
              envVar={s.envVar}
              label={meta.label}
              description={meta.description}
              helpUrl={meta.helpUrl}
              placeholder={meta.placeholder}
              source={s.source}
            />
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          How resolution works
        </h2>
        <p>
          When a publish or generation job runs, CNOS resolves each key in this
          order:
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            DB value set on this page (encrypted, can be edited anytime — no
            redeploy needed).
          </li>
          <li>
            Vercel environment variable with the same name (the legacy path —
            existing deployments keep working unchanged).
          </li>
          <li>
            If neither is set, the job returns a clear &ldquo;key not
            configured&rdquo; error and the draft lands in the Failed column.
          </li>
        </ol>
        <p>
          Clearing a UI-set key falls back to the env var (if any). Override
          via UI is local to this deployment&apos;s database; no other site
          shares it.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 text-sm">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Inngest (separate)
        </h2>
        <p className="text-muted-foreground">
          Inngest event + signing keys are platform-level and stay in Vercel
          env vars only:{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
            INNGEST_EVENT_KEY
          </code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
            INNGEST_SIGNING_KEY
          </code>
          . They&apos;re used to authenticate the Inngest sync at boot and
          can&apos;t live in the DB.{" "}
          <a
            href="https://app.inngest.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-0.5 underline underline-offset-2"
          >
            app.inngest.com <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>
    </div>
  );
}
