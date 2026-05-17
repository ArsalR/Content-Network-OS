import { SiteForm } from "@/components/sites/site-form";

export default function NewSitePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Add site</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a WordPress site to start publishing content
        </p>
      </div>
      <SiteForm />
    </div>
  );
}
