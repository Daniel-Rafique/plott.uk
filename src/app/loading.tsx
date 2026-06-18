export default function RootLoading() {
  return (
    <main
      className="flex flex-1 flex-col overflow-hidden bg-zinc-50 text-zinc-900"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading the next Plott page</span>
      <section className="relative flex flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(176,158,126,0.18),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(24,24,27,0.08),transparent_28%)]" />
        <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-16 sm:py-20 lg:px-8">
          <div className="max-w-3xl">
            <div className="mb-8 h-3 w-44 animate-pulse rounded-full bg-zinc-300/80" />
            <div className="space-y-4">
              <div className="h-12 w-full max-w-2xl animate-pulse rounded-2xl bg-zinc-200" />
              <div className="h-12 w-5/6 animate-pulse rounded-2xl bg-zinc-200" />
              <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-zinc-200" />
            </div>
            <div className="mt-8 space-y-3">
              <div className="h-4 w-full max-w-xl animate-pulse rounded-full bg-zinc-200" />
              <div className="h-4 w-11/12 max-w-lg animate-pulse rounded-full bg-zinc-200" />
              <div className="h-4 w-2/3 max-w-md animate-pulse rounded-full bg-zinc-200" />
            </div>
            <div className="mt-10 flex flex-wrap gap-3">
              <div className="h-12 w-40 animate-pulse rounded-full bg-zinc-900/90" />
              <div className="h-12 w-36 animate-pulse rounded-full border border-zinc-300 bg-white/70" />
            </div>
          </div>
          <div className="mt-16 grid gap-4 md:grid-cols-3">
            <div className="h-44 animate-pulse rounded-[2rem] border border-zinc-200 bg-white/80 shadow-sm" />
            <div className="h-44 animate-pulse rounded-[2rem] border border-zinc-200 bg-white/70 shadow-sm [animation-delay:120ms]" />
            <div className="h-44 animate-pulse rounded-[2rem] border border-zinc-200 bg-white/60 shadow-sm [animation-delay:240ms]" />
          </div>
        </div>
      </section>
    </main>
  );
}
