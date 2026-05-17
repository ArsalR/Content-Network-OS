"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

type Job = {
  id: string;
  kind: string;
  status: "queued" | "running" | "completed" | "failed";
  inputId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
};

type Props = {
  jobs: Job[];
};

function StatusBadge({ status }: { status: Job["status"] }) {
  const styles: Record<Job["status"], string> = {
    queued: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    running:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    completed:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status === "running" && (
        <span className="inline-block h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />
      )}
      {status}
    </span>
  );
}

function extractKeyword(inputId: string | null): string {
  if (!inputId) return "—";
  const parts = inputId.split(":");
  // inputId is "siteId:keyword"
  return parts.slice(1).join(":") || inputId;
}

export function PipelineJobsTable({ jobs: initialJobs }: Props) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);

  const hasActive = jobs.some(
    (j) => j.status === "queued" || j.status === "running"
  );

  useEffect(() => {
    if (!hasActive) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/pipeline/jobs");
        if (!res.ok) return;
        const data = (await res.json()) as { jobs: Job[] };
        setJobs(data.jobs);
      } catch {
        // silently ignore fetch errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [hasActive]);

  if (!jobs.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-2 text-base font-semibold text-foreground">
          Recent Jobs
        </h2>
        <p className="text-sm text-muted-foreground">
          No pipeline jobs yet. Run the pipeline above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">Recent Jobs</h2>
        {hasActive && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Auto-refreshing every 5 seconds&hellip;
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-6 py-3 font-medium text-muted-foreground">
                Keyword
              </th>
              <th className="px-4 py-3 font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 font-medium text-muted-foreground">
                Created
              </th>
              <th className="px-4 py-3 font-medium text-muted-foreground">
                Completed
              </th>
              <th className="px-4 py-3 font-medium text-muted-foreground">
                Error
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr
                key={job.id}
                className="border-b border-border last:border-0 hover:bg-accent/40"
              >
                <td className="px-6 py-3 font-medium text-foreground">
                  {extractKeyword(job.inputId)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(job.createdAt), {
                    addSuffix: true,
                  })}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {job.completedAt
                    ? formatDistanceToNow(new Date(job.completedAt), {
                        addSuffix: true,
                      })
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-destructive">
                  {job.errorMessage ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
