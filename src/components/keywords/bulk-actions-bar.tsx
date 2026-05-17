"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bulkDeleteKeywords,
  bulkAssignCluster,
  bulkUpdateStatus,
} from "@/actions/keywords";
import { generateBriefFromKeyword } from "@/actions/briefs";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "briefed", label: "Briefed" },
  { value: "generated", label: "Generated" },
  { value: "published", label: "Published" },
  { value: "skipped", label: "Skipped" },
];

interface Props {
  selectedIds: string[];
  projectId: string;
  onClear: () => void;
}

export function BulkActionsBar({ selectedIds, projectId, onClear }: Props) {
  const [clusterValue, setClusterValue] = useState("");
  const [showClusterInput, setShowClusterInput] = useState(false);
  const [showStatusSelect, setShowStatusSelect] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [briefProgress, setBriefProgress] = useState<{ done: number; total: number } | null>(null);

  function handleDelete() {
    startTransition(async () => {
      await bulkDeleteKeywords(selectedIds);
      onClear();
    });
  }

  function handleAssignCluster() {
    if (!showClusterInput) {
      setShowClusterInput(true);
      setShowStatusSelect(false);
      return;
    }
    startTransition(async () => {
      await bulkAssignCluster(selectedIds, clusterValue);
      setClusterValue("");
      setShowClusterInput(false);
      onClear();
    });
  }

  function handleGenerateBriefs() {
    startTransition(async () => {
      setBriefProgress({ done: 0, total: selectedIds.length });
      for (let i = 0; i < selectedIds.length; i++) {
        await generateBriefFromKeyword(selectedIds[i], projectId);
        setBriefProgress({ done: i + 1, total: selectedIds.length });
      }
      toast.success(`Generated ${selectedIds.length} brief${selectedIds.length !== 1 ? "s" : ""}`);
      setBriefProgress(null);
      onClear();
    });
  }

  function handleStatusChange(status: string) {
    startTransition(async () => {
      await bulkUpdateStatus(selectedIds, status);
      setShowStatusSelect(false);
      onClear();
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2">
      <span className="text-sm text-muted-foreground">
        {selectedIds.length} selected
      </span>
      <div className="mx-2 h-4 w-px bg-border" />

      {showClusterInput ? (
        <div className="flex items-center gap-2">
          <Input
            className="h-7 w-40 text-xs"
            placeholder="Cluster name…"
            value={clusterValue}
            onChange={(e) => setClusterValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAssignCluster();
              if (e.key === "Escape") setShowClusterInput(false);
            }}
            autoFocus
          />
          <Button size="sm" onClick={handleAssignCluster} disabled={isPending}>
            Apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowClusterInput(false)}
          >
            Cancel
          </Button>
        </div>
      ) : showStatusSelect ? (
        <div className="flex items-center gap-1">
          {STATUS_OPTIONS.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant="outline"
              onClick={() => handleStatusChange(s.value)}
              disabled={isPending}
              className="h-7 text-xs"
            >
              {s.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowStatusSelect(false)}
            className="h-7 text-xs"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAssignCluster}
            disabled={isPending}
            className="h-7 text-xs"
          >
            Assign Cluster
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowStatusSelect(true);
              setShowClusterInput(false);
            }}
            disabled={isPending}
            className="h-7 text-xs"
          >
            Change Status
          </Button>
          {briefProgress ? (
            <span className="text-xs text-muted-foreground">
              Generating {briefProgress.done}/{briefProgress.total} briefs…
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateBriefs}
              disabled={isPending}
              className="h-7 text-xs"
            >
              Generate Briefs
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
            className="h-7 text-xs"
          >
            Delete Selected
          </Button>
        </>
      )}

      <div className="ml-auto">
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          className="h-7 text-xs"
        >
          Clear selection
        </Button>
      </div>
    </div>
  );
}
