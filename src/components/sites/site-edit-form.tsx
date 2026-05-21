"use client";

import { useActionState, useState, useRef } from "react";
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

type SiteKind = "wordpress" | "pinterest-cms";

type Site = {
  id: string;
  name: string;
  hostname: string;
  apiBaseUrl: string;
  kind?: "wordpress" | "pinterest-cms";
  defaultCategory: string | null;
  defaultTone: string | null;
  notes: string | null;
  imageProvider: "dalle" | "gemini";
  imageStyle: string | null;
  pinterestMode?: boolean | null;
  pinterestCoverPromptExtra?: string | null;
  pinterestSectionPromptExtra?: string | null;
  pinterestContentStyle?: string | null;
  pinterestImageSize?: string | null;
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
  const [pinterestMode, setPinterestMode] = useState<boolean>(
    site.pinterestMode ?? false
  );
  const [kind, setKind] = useState<SiteKind>(site.kind ?? "wordpress");
  const apiBaseUrlRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState(
    buildAction(site.id),
    initialState
  );

  function applyPinterestCmsDefault() {
    const host = site.hostname?.trim();
    if (!host || !apiBaseUrlRef.current) return;
    apiBaseUrlRef.current.value = `https://${host.replace(/^https?:\/\//, "")}/api/public/v1`;
  }

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
          <Label>CMS Type</Label>
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
            defaultValue={site.apiBaseUrl}
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
          <p className="text-xs text-muted-foreground">
            Current key: ••••••••. Leave blank to keep existing key.
          </p>
          <Input
            id="apiKey"
            name="apiKey"
            type="password"
            placeholder={
              kind === "pinterest-cms"
                ? "cms_live_… (leave blank to keep existing)"
                : "Enter new API key to change"
            }
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

        {/* Pinterest Settings */}
        <div className="border-t border-border pt-4 space-y-4">
          <h3 className="text-sm font-medium text-foreground">
            Pinterest Settings
          </h3>

          {/* Hidden input ensures FormData always has a value (even when checkbox unchecked).
              When checked, the checkbox's "true" value comes AFTER the hidden in the form,
              and FormData.get() returns the LAST value with that name. */}
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
            Generates vertical Pinterest-optimized articles: pin-style cover image, vertical
            section images, aspirational language, unique visuals per item.
          </p>

          {pinterestMode && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pinterestCoverPromptExtra">
                  Cover Image Extra Instructions
                </Label>
                <Textarea
                  id="pinterestCoverPromptExtra"
                  name="pinterestCoverPromptExtra"
                  rows={2}
                  defaultValue={site.pinterestCoverPromptExtra ?? ""}
                  placeholder="e.g. use warm autumn tones, include text overlay with serif font, cozy home aesthetic"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pinterestSectionPromptExtra">
                  Section Image Extra Instructions
                </Label>
                <Textarea
                  id="pinterestSectionPromptExtra"
                  name="pinterestSectionPromptExtra"
                  rows={2}
                  defaultValue={site.pinterestSectionPromptExtra ?? ""}
                  placeholder="e.g. bright airy photography, white backgrounds, minimalist style, show products in use"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pinterestContentStyle">
                  Content Style Instructions
                </Label>
                <Textarea
                  id="pinterestContentStyle"
                  name="pinterestContentStyle"
                  rows={2}
                  defaultValue={site.pinterestContentStyle ?? ""}
                  placeholder="e.g. focus on budget-friendly ideas under $50, use casual friendly tone, emphasize quick and easy"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pinterestImageSize">Target Image Size</Label>
                <Input
                  id="pinterestImageSize"
                  name="pinterestImageSize"
                  defaultValue={site.pinterestImageSize ?? "1000x1500"}
                  readOnly
                  className="bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">
                  Pinterest optimal: 1000×1500px (2:3 ratio). The closest size supported by
                  your image provider is used automatically (DALL-E: 1024×1792, Gemini: 2:3).
                </p>
              </div>
            </div>
          )}
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
