"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { bulkCreateKeywords } from "@/actions/keywords";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function BulkAddDialog({ open, onClose, projectId }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await bulkCreateKeywords(projectId, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText("");
      onClose();
    });
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const lines = content
        .split("\n")
        .map((l) => l.split(",")[0]?.trim() ?? "")
        .filter(Boolean);
      setText(lines.join("\n"));
    };
    reader.readAsText(file);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Keywords</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="text">
          <TabsList className="mb-3">
            <TabsTrigger value="text">Paste Text</TabsTrigger>
            <TabsTrigger value="csv">Upload CSV</TabsTrigger>
          </TabsList>
          <TabsContent value="text">
            <Textarea
              placeholder="One keyword per line&#10;keyword one&#10;keyword two"
              className="min-h-[180px] font-mono text-sm"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </TabsContent>
          <TabsContent value="csv">
            <div className="rounded-md border border-dashed border-border p-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                First column of CSV used as keyword
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                className="text-sm text-muted-foreground"
              />
            </div>
            {text && (
              <p className="mt-2 text-xs text-muted-foreground">
                {text.split("\n").filter(Boolean).length} keywords loaded
              </p>
            )}
          </TabsContent>
        </Tabs>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !text.trim()}>
            {isPending ? "Adding…" : "Add Keywords"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
