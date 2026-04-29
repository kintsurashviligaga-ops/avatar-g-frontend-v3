export default function DashboardLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-36 rounded-xl bg-white/[0.05] animate-pulse" />
          <div className="h-4 w-56 rounded-lg bg-white/[0.03] animate-pulse" />
        </div>
        <div className="h-9 w-36 rounded-xl bg-white/[0.04] animate-pulse" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl p-4 space-y-3 h-24 bg-white/[0.03] animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-5 w-24 rounded-lg bg-white/[0.04] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl h-28 bg-white/[0.03] animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
