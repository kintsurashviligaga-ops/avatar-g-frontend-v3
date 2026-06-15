// Shown during dashboard route transitions. The old card-grid skeleton looked like a
// DIFFERENT page flashing in before the chat appeared ("another page shows then fixes").
// A minimal, centred loader on the app background reads as "loading", not "wrong page".
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center bg-transparent">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-cyan-400" />
    </div>
  );
}
