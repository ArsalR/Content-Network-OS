"use client";

import { useState } from "react";
import { testSiteConnection } from "@/actions/sites";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; name: string }
  | { kind: "error"; message: string };

export function TestConnectionButton({ siteId }: { siteId: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleTest() {
    setStatus({ kind: "loading" });
    const result = await testSiteConnection(siteId);
    if (result.ok) {
      setStatus({ kind: "success", name: result.data.name });
    } else {
      setStatus({ kind: "error", message: result.error });
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleTest}
        disabled={status.kind === "loading"}
      >
        {status.kind === "loading" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Testing...
          </>
        ) : (
          "Test connection"
        )}
      </Button>

      {status.kind === "success" && (
        <p className="flex items-center gap-1.5 text-sm text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          Connected — {status.name}
        </p>
      )}

      {status.kind === "error" && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <XCircle className="h-4 w-4" />
          Error: {status.message}
        </p>
      )}
    </div>
  );
}
