"use client";

import { useActionState } from "react";
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

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create site"}
      </Button>
    </form>
  );
}
