export default function ProjectsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="animate-pulse bg-muted rounded h-7 w-32" />
          <div className="animate-pulse bg-muted rounded h-4 w-56" />
        </div>
        <div className="animate-pulse bg-muted rounded h-9 w-32" />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="animate-pulse bg-muted/50 h-11 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-t border-border">
            <div className="animate-pulse bg-muted rounded h-4 w-40" />
            <div className="animate-pulse bg-muted rounded h-4 w-20" />
            <div className="animate-pulse bg-muted rounded h-4 w-28" />
            <div className="animate-pulse bg-muted rounded h-4 w-12" />
            <div className="animate-pulse bg-muted rounded h-4 w-12" />
            <div className="animate-pulse bg-muted rounded h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
