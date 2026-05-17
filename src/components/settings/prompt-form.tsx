"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPromptTemplate,
  updatePromptTemplate,
} from "@/actions/prompt-templates";

interface PromptTemplate {
  id: string;
  name: string;
  kind: "outline" | "draft" | "image_prompt" | "social_caption";
  template: string;
  isDefault: boolean;
}

interface Props {
  template?: PromptTemplate;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const KIND_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "outline", label: "Outline" },
  { value: "image_prompt", label: "Image Prompt" },
  { value: "social_caption", label: "Social Caption" },
];

export function PromptForm({ template, onSuccess, onCancel }: Props) {
  const [kind, setKind] = useState<string>(template?.kind ?? "draft");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("kind", kind);
    formData.set("isDefault", isDefault ? "true" : "false");

    startTransition(async () => {
      const result = template
        ? await updatePromptTemplate(template.id, formData)
        : await createPromptTemplate(formData);

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
          defaultValue={template?.name ?? ""}
          placeholder="e.g. Default Draft"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kind">Kind</Label>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger id="kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="template">Template</Label>
        <Textarea
          id="template"
          name="template"
          defaultValue={template?.template ?? ""}
          placeholder="Mustache-style template with {{variables}}…"
          className="min-h-[240px] font-mono text-xs"
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isDefault"
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="isDefault" className="cursor-pointer">
          Set as default for this kind
        </Label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving…"
            : template
              ? "Update Template"
              : "Create Template"}
        </Button>
      </div>
    </form>
  );
}
