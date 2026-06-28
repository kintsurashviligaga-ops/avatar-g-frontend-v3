// Shown while the force-dynamic dashboard server component awaits auth, BEFORE the
// studio shell streams in. It must be visually CONTINUOUS with that shell or it reads
// as "another page flashes then fixes" (the recurring report): the shell is
// `fixed inset-0 bg-app-bg`, so this loader is too — a full-screen OPAQUE app-bg cover
// (not bg-transparent/min-h-70vh, which let the locale gradient bleed through and
// floated a partial page). Same dark screen → spinner → chat: one continuous surface.
export default function DashboardLoading() {
  return (
    <div className="fixed inset-0 z-[2] flex items-center justify-center bg-app-bg">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-cyan-400" />
    </div>
  );
}
