"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deletePromptTemplate } from "@/actions/prompt-templates";
import { PromptForm } from "./prompt-form";
import { PromptPreview } from "./prompt-preview";

interface PromptTemplate {
  id: string;
  name: string;
  kind: "outline" | "draft" | "image_prompt" | "social_caption";
  template: string;
  isDefault: boolean;
}

export function PromptActions({ template }: { template: PromptTemplate }) {
  const [showEdit, setShowEdit] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Delete template "${template.name}"? This cannot be undone.`))
      return;
    startTransition(async () => {
      const result = await deletePromptTemplate(template.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <PromptPreview template={template.template} name={template.name} />
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <PromptForm
            template={template}
            onSuccess={() => setShowEdit(false)}
            onCancel={() => setShowEdit(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
