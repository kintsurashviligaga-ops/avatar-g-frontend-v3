// Subtle, on-brand (cyan) route-transition loader. The old version was a large gold
// (#D4AF37, off-palette) full-screen spinner with "Loading…" text that read like a
// separate page flashing in. A small centred cyan ring is calm + consistent.
export default function LocaleLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-cyan-400" />
    </div>
  );
}
