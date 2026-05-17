"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { updateSite } from "@/actions/sites";
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
import { TestConnectionButton } from "@/components/sites/test-connection-button";

type Site = {
  id: string;
  name: string;
  hostname: string;
  apiBaseUrl: string;
  defaultCategory: string | null;
  defaultTone: string | null;
  notes: string | null;
  imageProvider: "dalle" | "gemini";
  imageStyle: string | null;
};

type ActionState =
  | { ok: true; data: { id: string } }
  | { ok: false; error: string }
  | null;

const initialState: ActionState = null;

function buildAction(id: string) {
  return async function updateSiteAction(
    _prev: ActionState,
    formData: FormData
  ): Promise<ActionState> {
    return updateSite(id, formData);
  };
}

export function SiteEditForm({ site }: { site: Site }) {
  const router = useRouter();
  const [imageProvider, setImageProvider] = useState<"dalle" | "gemini">(
    site.imageProvider
  );
  const [state, formAction, isPending] = useActionState(
    buildAction(site.id),
    initialState
  );

  useEffect(() => {
    if (state?.ok) {
      router.push("/sites");
    }
  }, [state, router]);

  return (
    <div className="space-y-8 max-w-xl">
      <form action={formAction} className="space-y-6">
        {state && !state.ok && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={site.name} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hostname">Hostname</Label>
          <Input
            id="hostname"
            name="hostname"
            defaultValue={site.hostname}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiBaseUrl">API Base URL</Label>
          <Input
            id="apiBaseUrl"
            name="apiBaseUrl"
            type="url"
            defaultValue={site.apiBaseUrl}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey">API Key</Label>
          <p className="text-xs text-muted-foreground">
            Current key: ••••••••. Leave blank to keep existing key.
          </p>
          <Input
            id="apiKey"
            name="apiKey"
            type="password"
            placeholder="Enter new API key to change"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultCategory">Default Category (optional)</Label>
          <Input
            id="defaultCategory"
            name="defaultCategory"
            defaultValue={site.defaultCategory ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultTone">Default Tone (optional)</Label>
          <Input
            id="defaultTone"
            name="defaultTone"
            defaultValue={site.defaultTone ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={site.notes ?? ""}
            rows={3}
          />
        </div>

        {/* Image generation settings */}
        <div className="border-t border-border pt-4 space-y-4">
          <h3 className="text-sm font-medium text-foreground">
            Image Generation
          </h3>

          <div className="space-y-2">
            <Label>Image Provider</Label>
            {/* Hidden input carries the value into FormData */}
            <input
              type="hidden"
              name="imageProvider"
              value={imageProvider}
            />
            <Select
              value={imageProvider}
              onValueChange={(v) =>
                setImageProvider(v as "dalle" | "gemini")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dalle">DALL-E 3 (OpenAI)</SelectItem>
                <SelectItem value="gemini">Gemini Imagen (Google)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Provider used when generating inline article images.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="imageStyle">Image Style Prefix (optional)</Label>
            <Input
              id="imageStyle"
              name="imageStyle"
              defaultValue={site.imageStyle ?? ""}
              placeholder="Pinterest-style, vibrant colors,"
            />
            <p className="text-xs text-muted-foreground">
              Text prepended to every image prompt, e.g.{" "}
              <span className="font-mono">
                Pinterest-style, vibrant colors,
              </span>
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>

      <div className="border-t border-border pt-6">
        <h3 className="mb-3 text-sm font-medium text-foreground">
          Connection
        </h3>
        <TestConnectionButton siteId={site.id} />
      </div>
    </div>
  );
}
