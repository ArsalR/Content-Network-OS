"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTone, updateTone } from "@/actions/tones";

interface Tone {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
}

interface Props {
  tone?: Tone;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ToneForm({ tone, onSuccess, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = tone
        ? await updateTone(tone.id, formData)
        : await createTone(formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={tone?.name ?? ""}
          placeholder="e.g. Warm & Inspiring"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Input
          id="description"
          name="description"
          defaultValue={tone?.description ?? ""}
          placeholder="Short description of this tone"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prompt">Prompt</Label>
        <Textarea
          id="prompt"
          name="prompt"
          defaultValue={tone?.prompt ?? ""}
          placeholder="Instructions for the AI about how to write in this tone…"
          className="min-h-[120px]"
          required
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : tone ? "Update Tone" : "Create Tone"}
        </Button>
      </div>
    </form>
  );
}
