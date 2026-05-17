"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { updateProject } from "@/actions/projects";
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

type Project = {
  id: string;
  name: string;
  description: string | null;
  defaultSiteId: string | null;
  defaultCategory: string | null;
  defaultWordCount: number;
  defaultTone: string | null;
};

type ActionState =
  | { ok: true; data: { id: string } }
  | { ok: false; error: string }
  | null;

const initialState: ActionState = null;

function buildAction(id: string) {
  return async function updateProjectAction(
    _prev: ActionState,
    formData: FormData
  ): Promise<ActionState> {
    return updateProject(id, formData);
  };
}

export function ProjectEditForm({
  project,
  sites,
}: {
  project: Project;
  sites: Site[];
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    buildAction(project.id),
    initialState
  );

  useEffect(() => {
    if (state?.ok) {
      router.push(`/projects/${project.id}`);
    }
  }, [state, router, project.id]);

  return (
    <form action={formAction} className="space-y-6 max-w-xl">
      {state && !state.ok && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={project.name}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={project.description ?? ""}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="defaultSiteId">Default Site (optional)</Label>
        <Select
          name="defaultSiteId"
          defaultValue={project.defaultSiteId ?? undefined}
        >
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
          defaultValue={project.defaultCategory ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="defaultWordCount">Default Word Count</Label>
        <Input
          id="defaultWordCount"
          name="defaultWordCount"
          type="number"
          defaultValue={project.defaultWordCount}
          min={100}
          max={10000}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="defaultTone">Default Tone (optional)</Label>
        <Input
          id="defaultTone"
          name="defaultTone"
          defaultValue={project.defaultTone ?? ""}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/projects/${project.id}`)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
