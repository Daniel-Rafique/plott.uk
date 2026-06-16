export default function AppLoading() {
  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Skeleton layout for dashboard */}
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-100" />
          <div className="h-10 w-32 animate-pulse rounded-full bg-zinc-100" />
        </div>
        
        {/* Content skeleton */}
        <div className="grid flex-1 gap-6 md:grid-cols-[1fr_400px]">
          {/* Map placeholder */}
          <div className="h-full min-h-[400px] animate-pulse rounded-xl bg-zinc-100" />
          
          {/* Sidebar placeholder */}
          <div className="space-y-4">
            <div className="h-12 animate-pulse rounded-lg bg-zinc-100" />
            <div className="h-64 animate-pulse rounded-xl bg-zinc-100" />
            <div className="h-32 animate-pulse rounded-xl bg-zinc-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
