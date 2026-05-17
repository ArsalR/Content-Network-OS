"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2, CheckCheck, Wand2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { deleteBrief, markBriefReady, generateBriefFromKeyword } from "@/actions/briefs";
import { enqueueGeneration } from "@/actions/drafts";

type BriefStatus = "draft" | "ready" | "generating" | "generated" | "published";

interface Brief {
  id: string;
  title: string;
  targetKeyword: string;
  wordCount: number;
  toneName: string | null;
  status: BriefStatus;
  keywordId: string | null;
  createdAt: Date;
}

interface Props {
  briefs: Brief[];
  projectId: string;
}

const STATUS_COLORS: Record<BriefStatus, string> = {
  draft: "border-transparent bg-zinc-700 text-zinc-200",
  ready: "border-transparent bg-blue-800 text-blue-200",
  generating: "border-transparent bg-yellow-800 text-yellow-200",
  generated: "border-transparent bg-green-800 text-green-200",
  published: "border-transparent bg-teal-800 text-teal-200",
};

export function BriefList({ briefs, projectId }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function handleDelete(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await deleteBrief(id);
      if (!result.ok) {
        setErrors((prev) => ({ ...prev, [id]: result.error }));
      }
      setPendingId(null);
    });
  }

  function handleMarkReady(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await markBriefReady(id);
      if (!result.ok) {
        setErrors((prev) => ({ ...prev, [id]: result.error }));
      }
      setPendingId(null);
    });
  }

  function handleGenerate(brief: Brief) {
    if (!brief.keywordId) return;
    setPendingId(brief.id);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[brief.id];
      return next;
    });
    startTransition(async () => {
      const result = await generateBriefFromKeyword(brief.keywordId!, projectId);
      if (!result.ok) {
        setErrors((prev) => ({ ...prev, [brief.id]: result.error }));
      }
      setPendingId(null);
    });
  }

  function handleGenerateDraft(brief: Brief) {
    setPendingId(brief.id);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[brief.id];
      return next;
    });
    startTransition(async () => {
      const result = await enqueueGeneration(brief.id);
      if (result.ok) {
        toast.success("Draft queued! Generation will complete shortly.");
      } else {
        setErrors((prev) => ({ ...prev, [brief.id]: result.error }));
        toast.error(result.error);
      }
      setPendingId(null);
    });
  }

  if (briefs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No briefs yet. Generate one from a keyword or create one manually.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Target Keyword</TableHead>
            <TableHead className="w-24">Words</TableHead>
            <TableHead className="w-32">Tone</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-36">Created</TableHead>
            <TableHead className="w-40">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {briefs.map((brief) => (
            <TableRow key={brief.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/projects/${projectId}/briefs/${brief.id}`}
                  className="hover:underline"
                >
                  {brief.title}
                </Link>
                {errors[brief.id] && (
                  <p className="mt-1 text-xs text-red-400">{errors[brief.id]}</p>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {brief.targetKeyword}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {brief.wordCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {brief.toneName ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <Badge className={STATUS_COLORS[brief.status]}>
                  {brief.status}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {brief.createdAt.toLocaleDateString()}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {brief.status === "draft" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={pendingId === brief.id}
                      onClick={() => handleMarkReady(brief.id)}
                    >
                      <CheckCheck className="h-3 w-3" />
                      Ready
                    </Button>
                  )}
                  {brief.status === "draft" && brief.keywordId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={pendingId === brief.id}
                      onClick={() => handleGenerate(brief)}
                    >
                      <Wand2 className="h-3 w-3" />
                      {pendingId === brief.id ? "…" : "Gen"}
                    </Button>
                  )}
                  {brief.status === "ready" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={pendingId === brief.id}
                      onClick={() => handleGenerateDraft(brief)}
                    >
                      <Sparkles className="h-3 w-3" />
                      {pendingId === brief.id ? "Queuing…" : "Draft"}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={pendingId === brief.id}
                    onClick={() => handleDelete(brief.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
