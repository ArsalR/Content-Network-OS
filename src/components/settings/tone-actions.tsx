"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteTone } from "@/actions/tones";
import { ToneForm } from "./tone-form";

interface Tone {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
}

export function ToneActions({ tone }: { tone: Tone }) {
  const [showEdit, setShowEdit] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Delete tone "${tone.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteTone(tone.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={isPending}
        >
          Delete
        </Button>
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Tone</DialogTitle>
          </DialogHeader>
          <ToneForm
            tone={tone}
            onSuccess={() => setShowEdit(false)}
            onCancel={() => setShowEdit(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
