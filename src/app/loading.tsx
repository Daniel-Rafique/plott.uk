export default function RootLoading() {
  return (
    <main
      className="flex flex-1 bg-zinc-50"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading the next Plott page</span>
    </main>
  );
}
