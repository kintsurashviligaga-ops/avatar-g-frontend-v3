// Subtle, on-brand (cyan) root loader — replaces the old large gold (#D4AF37,
// off-palette) spinner with "Initializing Digital Twin Protocol…" text that flashed
// like a separate page. A small centred cyan ring is calm + consistent across the app.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-cyan-400" />
    </div>
  );
}
