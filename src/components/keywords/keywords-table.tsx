"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateKeyword, deleteKeyword } from "@/actions/keywords";
import { BulkAddDialog } from "./bulk-add-dialog";
import { BulkActionsBar } from "./bulk-actions-bar";

type KeywordStatus = "new" | "briefed" | "generated" | "published" | "skipped";
type KeywordIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

interface Keyword {
  id: string;
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  intent: KeywordIntent | null;
  cluster: string | null;
  status: KeywordStatus;
  notes: string | null;
}

interface Props {
  keywords: Keyword[];
  projectId: string;
}

const STATUS_COLORS: Record<KeywordStatus, string> = {
  new: "border-transparent bg-zinc-700 text-zinc-200",
  briefed: "border-transparent bg-blue-800 text-blue-200",
  generated: "border-transparent bg-purple-800 text-purple-200",
  published: "border-transparent bg-green-800 text-green-200",
  skipped: "border-transparent bg-yellow-800 text-yellow-200",
};

const INTENT_OPTIONS: KeywordIntent[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
];
const STATUS_OPTIONS: KeywordStatus[] = [
  "new",
  "briefed",
  "generated",
  "published",
  "skipped",
];

function EditableCell({
  id,
  field,
  value,
  numeric,
}: {
  id: string;
  field: string;
  value: string | number | null;
  numeric?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const [, startTransition] = useTransition();

  function save() {
    setEditing(false);
    const next = draft.trim() === "" ? null : numeric ? Number(draft) : draft;
    startTransition(async () => {
      await updateKeyword(id, field, next);
    });
  }

  if (editing) {
    return (
      <Input
        className="h-7 w-full min-w-[80px] text-xs"
        type={numeric ? "number" : "text"}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <span
      className="block min-w-[60px] cursor-pointer rounded px-1 py-0.5 hover:bg-accent"
      onClick={() => {
        setDraft(value?.toString() ?? "");
        setEditing(true);
      }}
    >
      {value ?? <span className="text-muted-foreground">—</span>}
    </span>
  );
}

function IntentSelect({
  id,
  value,
}: {
  id: string;
  value: KeywordIntent | null;
}) {
  const [, startTransition] = useTransition();

  return (
    <select
      className="h-7 rounded border-0 bg-transparent text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      value={value ?? ""}
      onChange={(e) => {
        const val = e.target.value as KeywordIntent | "";
        startTransition(async () => {
          await updateKeyword(id, "intent", val === "" ? null : val);
        });
      }}
    >
      <option value="">—</option>
      {INTENT_OPTIONS.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function StatusSelect({
  id,
  value,
}: {
  id: string;
  value: KeywordStatus;
}) {
  const [, startTransition] = useTransition();

  return (
    <select
      className={`h-7 rounded border px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${STATUS_COLORS[value]}`}
      value={value}
      onChange={(e) => {
        const val = e.target.value as KeywordStatus;
        startTransition(async () => {
          await updateKeyword(id, "status", val);
        });
      }}
    >
      {STATUS_OPTIONS.map((o) => (
        <option key={o} value={o} className="bg-background text-foreground">
          {o}
        </option>
      ))}
    </select>
  );
}

export function KeywordsTable({ keywords, projectId }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [, startTransition] = useTransition();

  const allSelected =
    keywords.length > 0 && selectedIds.size === keywords.length;

  function toggleAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(keywords.map((k) => k.id))
    );
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteKeyword(id);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {keywords.length} keyword{keywords.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => setShowBulkAdd(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Keywords
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <BulkActionsBar
          selectedIds={[...selectedIds]}
          projectId={projectId}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {keywords.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No keywords yet. Click &ldquo;Add Keywords&rdquo; to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </TableHead>
                <TableHead>Keyword</TableHead>
                <TableHead className="w-24">Volume</TableHead>
                <TableHead className="w-24">Difficulty</TableHead>
                <TableHead className="w-36">Intent</TableHead>
                <TableHead className="w-32">Cluster</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keywords.map((kw) => (
                <TableRow key={kw.id} data-state={selectedIds.has(kw.id) ? "selected" : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(kw.id)}
                      onChange={() => toggleOne(kw.id)}
                      className="rounded"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <EditableCell
                      id={kw.id}
                      field="keyword"
                      value={kw.keyword}
                    />
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      id={kw.id}
                      field="searchVolume"
                      value={kw.searchVolume}
                      numeric
                    />
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      id={kw.id}
                      field="difficulty"
                      value={kw.difficulty}
                      numeric
                    />
                  </TableCell>
                  <TableCell>
                    <IntentSelect id={kw.id} value={kw.intent} />
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      id={kw.id}
                      field="cluster"
                      value={kw.cluster}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusSelect id={kw.id} value={kw.status} />
                  </TableCell>
                  <TableCell>
                    <EditableCell id={kw.id} field="notes" value={kw.notes} />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(kw.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <BulkAddDialog
        open={showBulkAdd}
        onClose={() => setShowBulkAdd(false)}
        projectId={projectId}
      />
    </div>
  );
}

export { Badge };
