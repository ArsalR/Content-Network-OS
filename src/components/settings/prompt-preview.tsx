"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { renderTemplate } from "@/lib/template";

const sampleVars = {
  title: "10 Benefits of Shilajit",
  targetKeyword: "shilajit benefits",
  wordCount: 1200,
  toneDescription: "Warm and encouraging",
  outline: [
    {
      h2: "What is Shilajit?",
      points: ["Ancient resin", "Used in Ayurveda"],
    },
  ],
};

interface Props {
  template: string;
  name: string;
}

export function PromptPreview({ template, name }: Props) {
  const [open, setOpen] = useState(false);
  const rendered = renderTemplate(template, sampleVars);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Eye className="mr-1.5 h-3.5 w-3.5" />
        Preview
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview: {name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">
              {rendered}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
