"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setApiKey, clearApiKey } from "@/actions/app-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ExternalLink, Pencil, Trash2, Save, X } from "lucide-react";

interface ApiKeyRowProps {
  envVar: string;
  label: string;
  description: string;
  helpUrl: string;
  placeholder: string;
  source: "db" | "env" | "unset";
}

export function ApiKeyRow({
  envVar,
  label,
  description,
  helpUrl,
  placeholder,
  source,
}: ApiKeyRowProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!value.trim()) {
      toast.error("Enter a value before saving.");
      return;
    }
    startTransition(async () => {
      const res = await setApiKey(envVar, value);
      if (res.ok) {
        toast.success(`${label} saved.`);
        setValue("");
        setEditing(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleClear() {
    if (
      !confirm(
        `Remove the ${label} key from this dashboard? The Vercel env var (if any) will take over.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await clearApiKey(envVar);
      if (res.ok) {
        toast.success(`${label} cleared.`);
        setEditing(false);
        setValue("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{label}</h3>
            <SourceBadge source={source} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          {helpUrl && (
            <a
              href={helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Get a key <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {envVar}
          </p>
        </div>

        {!editing && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={isPending}
              className="h-7 gap-1.5"
            >
              <Pencil className="h-3 w-3" />
              {source === "db" ? "Replace" : "Set key"}
            </Button>
            {source === "db" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={isPending}
                className="h-7 text-muted-foreground hover:text-destructive"
                aria-label="Clear key"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            disabled={isPending}
            autoFocus
            className="font-mono text-sm"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isPending || !value.trim()}
            className="gap-1.5"
          >
            <Save className="h-3 w-3" />
            {isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(false);
              setValue("");
            }}
            disabled={isPending}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: "db" | "env" | "unset" }) {
  if (source === "db") {
    return (
      <Badge className="border-transparent bg-green-500/20 text-green-400 hover:bg-green-500/20 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Set (via UI)
      </Badge>
    );
  }
  if (source === "env") {
    return (
      <Badge className="border-transparent bg-blue-500/20 text-blue-400 hover:bg-blue-500/20 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Set (via Vercel env)
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-red-500/20 text-red-400 hover:bg-red-500/20 gap-1">
      <XCircle className="h-3 w-3" />
      Not set
    </Badge>
  );
}
