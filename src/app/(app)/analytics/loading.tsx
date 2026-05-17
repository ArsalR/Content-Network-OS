export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="animate-pulse bg-muted rounded h-7 w-28" />
        <div className="animate-pulse bg-muted rounded h-4 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="animate-pulse bg-muted rounded h-3 w-24" />
            <div className="animate-pulse bg-muted rounded h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-md border border-border overflow-hidden">
        <div className="animate-pulse bg-muted/50 h-11 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-t border-border">
            <div className="animate-pulse bg-muted rounded h-4 w-20" />
            <div className="animate-pulse bg-muted rounded h-4 w-16" />
            <div className="animate-pulse bg-muted rounded h-4 w-16" />
            <div className="animate-pulse bg-muted rounded h-4 w-20" />
            <div className="animate-pulse bg-muted rounded h-4 w-16" />
            <div className="animate-pulse bg-muted rounded h-4 w-16" />
            <div className="animate-pulse bg-muted rounded h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
