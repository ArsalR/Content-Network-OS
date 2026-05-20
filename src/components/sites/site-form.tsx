"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createSite } from "@/actions/sites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ActionState =
  | { ok: true; data: { id: string } }
  | { ok: false; error: string }
  | null;

const initialState: ActionState = null;

async function createSiteAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return createSite(formData);
}

export function SiteForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createSiteAction, initialState);
  const [pinterestMode, setPinterestMode] = useState<boolean>(false);

  useEffect(() => {
    if (state?.ok) {
      router.push("/sites");
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
        <Input id="name" name="name" placeholder="My Blog" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="hostname">Hostname</Label>
        <Input id="hostname" name="hostname" placeholder="myblog.com" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiBaseUrl">API Base URL</Label>
        <Input
          id="apiBaseUrl"
          name="apiBaseUrl"
          type="url"
          placeholder="https://myblog.com"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiKey">API Key</Label>
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          placeholder="Enter your WordPress application password"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="defaultCategory">Default Category (optional)</Label>
        <Input id="defaultCategory" name="defaultCategory" placeholder="uncategorized" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="defaultTone">Default Tone (optional)</Label>
        <Input id="defaultTone" name="defaultTone" placeholder="professional" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" placeholder="Any notes about this site..." rows={3} />
      </div>

      {/* Pinterest Settings */}
      <div className="border-t border-border pt-4 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Pinterest Settings</h3>

        {/* Hidden input ensures FormData always has the value (even when checkbox unchecked). */}
        <input type="hidden" name="pinterestMode" value="false" />
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            name="pinterestMode"
            value="true"
            checked={pinterestMode}
            onChange={(e) => setPinterestMode(e.target.checked)}
            className="accent-primary"
          />
          Enable Pinterest Mode
        </label>
        <p className="text-xs text-muted-foreground">
          Optimizes article generation for Pinterest: vertical images, pin-style cover, aspirational
          tone, and unique section visuals.
        </p>

        {pinterestMode && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pinterestCoverPromptExtra">Cover Image Extra Instructions</Label>
              <Textarea
                id="pinterestCoverPromptExtra"
                name="pinterestCoverPromptExtra"
                rows={2}
                placeholder="e.g. use warm autumn tones, include text overlay with serif font, cozy home aesthetic"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pinterestSectionPromptExtra">Section Image Extra Instructions</Label>
              <Textarea
                id="pinterestSectionPromptExtra"
                name="pinterestSectionPromptExtra"
                rows={2}
                placeholder="e.g. bright airy photography, white backgrounds, minimalist style, show products in use"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pinterestContentStyle">Content Style Instructions</Label>
              <Textarea
                id="pinterestContentStyle"
                name="pinterestContentStyle"
                rows={2}
                placeholder="e.g. focus on budget-friendly ideas under $50, use casual friendly tone, emphasize quick and easy"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pinterestImageSize">Target Image Size</Label>
              <Input
                id="pinterestImageSize"
                name="pinterestImageSize"
                defaultValue="1000x1500"
                readOnly
                className="bg-muted/50"
              />
              <p className="text-xs text-muted-foreground">
                Pinterest optimal: 1000×1500px (2:3 ratio). Stored as preference; the closest size
                supported by your image provider is used automatically.
              </p>
            </div>
          </div>
        )}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create site"}
      </Button>
    </form>
  );
}
