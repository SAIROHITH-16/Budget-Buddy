// Full-page loading indicator shown by <Suspense> while a lazy-loaded
// page chunk is being downloaded. Keeps the aurora gradient visible so
// the transition feels intentional rather than blank.
export function PageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      {/* Spinner ring */}
      <div className="w-10 h-10 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
      <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
    </div>
  );
}
