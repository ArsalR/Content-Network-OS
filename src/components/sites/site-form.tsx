"use client";

import { useActionState, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createSite } from "@/actions/sites";
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

type SiteKind = "wordpress" | "pinterest-cms";

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
  const [kind, setKind] = useState<SiteKind>("wordpress");
  const hostnameRef = useRef<HTMLInputElement>(null);
  const apiBaseUrlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) {
      router.push("/sites");
    }
  }, [state, router]);

  function applyPinterestCmsDefault() {
    const host = hostnameRef.current?.value?.trim();
    if (!host) {
      apiBaseUrlRef.current?.focus();
      return;
    }
    if (apiBaseUrlRef.current) {
      apiBaseUrlRef.current.value = `https://${host.replace(/^https?:\/\//, "")}/api/public/v1`;
    }
  }

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
        <Input id="hostname" name="hostname" ref={hostnameRef} placeholder="myblog.com" required />
      </div>

      <div className="space-y-2">
        <Label>CMS Type</Label>
        {/* Hidden input mirrors the controlled Select so FormData carries the value. */}
        <input type="hidden" name="kind" value={kind} />
        <Select value={kind} onValueChange={(v) => setKind(v as SiteKind)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wordpress">WordPress</SelectItem>
            <SelectItem value="pinterest-cms">Pinterest CMS</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Which CMS dialect this site speaks. Determines the API endpoints and payload shape
          used at publish time.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="apiBaseUrl">API Base URL</Label>
          {kind === "pinterest-cms" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={applyPinterestCmsDefault}
            >
              Use Pinterest CMS default
            </Button>
          )}
        </div>
        <Input
          id="apiBaseUrl"
          name="apiBaseUrl"
          ref={apiBaseUrlRef}
          type="url"
          placeholder={
            kind === "pinterest-cms"
              ? "https://myblog.com/api/public/v1"
              : "https://myblog.com"
          }
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiKey">API Key</Label>
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          placeholder={
            kind === "pinterest-cms"
              ? "cms_live_…"
              : "Enter your WordPress application password"
          }
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
