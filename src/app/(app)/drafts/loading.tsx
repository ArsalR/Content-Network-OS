export default function DraftsLoading() {
  const columns = ["Draft", "Review", "Approved", "Scheduled", "Published"];
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col} className="flex flex-col min-w-[260px] max-w-[300px] flex-shrink-0">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="animate-pulse bg-muted rounded h-4 w-20" />
            <div className="animate-pulse bg-muted rounded-full h-5 w-8" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-muted rounded-lg h-24 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
