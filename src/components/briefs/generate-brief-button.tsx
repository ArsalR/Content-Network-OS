"use client";

import { useState, useTransition } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateBriefFromKeyword } from "@/actions/briefs";
import { useRouter } from "next/navigation";

interface Props {
  keywordId: string;
  projectId: string;
  label?: string;
}

export function GenerateBriefButton({ keywordId, projectId, label }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generateBriefFromKeyword(keywordId, projectId);
      if (result.ok) {
        router.push(`/projects/${projectId}/briefs/${result.data.briefId}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={isPending}
        className="gap-1.5"
      >
        <Wand2 className="h-3.5 w-3.5" />
        {isPending ? "Generating…" : (label ?? "Generate Brief")}
      </Button>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
