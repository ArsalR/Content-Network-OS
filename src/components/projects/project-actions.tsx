"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveProject, restoreProject, deleteProject } from "@/actions/projects";
import { Button } from "@/components/ui/button";

type Status = "active" | "archived";

export function ProjectActions({
  projectId,
  status,
}: {
  projectId: string;
  status: Status;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveProject(projectId);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreProject(projectId);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteProject(projectId);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.push("/projects");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status === "active" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleArchive}
            disabled={isPending}
          >
            Archive
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRestore}
            disabled={isPending}
          >
            Restore
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
        >
          Delete
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
