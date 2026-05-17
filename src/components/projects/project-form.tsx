"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createProject } from "@/actions/projects";
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

type Site = { id: string; name: string };

type ActionState =
  | { ok: true; data: { id: string } }
  | { ok: false; error: string }
  | null;

const initialState: ActionState = null;

async function createProjectAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return createProject(formData);
}

export function ProjectForm({ sites }: { sites: Site[] }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    createProjectAction,
    initialState
  );

  useEffect(() => {
    if (state?.ok) {
      router.push(`/projects/${state.data.id}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-6 max-w-xl">
      {state && !state.ok && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="My Content Project" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="What is this project about?"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="defaultSiteId">Default Site (optional)</Label>
        <Select name="defaultSiteId">
          <SelectTrigger id="defaultSiteId">
            <SelectValue placeholder="Select a site" />
          </SelectTrigger>
          <SelectContent>
            {sites.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="defaultCategory">Default Category (optional)</Label>
        <Input
          id="defaultCategory"
          name="defaultCategory"
          placeholder="uncategorized"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="defaultWordCount">Default Word Count</Label>
        <Input
          id="defaultWordCount"
          name="defaultWordCount"
          type="number"
          defaultValue={1200}
          min={100}
          max={10000}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="defaultTone">Default Tone (optional)</Label>
        <Input
          id="defaultTone"
          name="defaultTone"
          placeholder="professional"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create project"}
      </Button>
    </form>
  );
}
