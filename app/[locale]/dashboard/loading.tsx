export default function DashboardLoading() {
  return (
    <div className="fixed inset-0 flex" style={{ background: '#0a0a0f' }}>
      {/* Sidebar skeleton */}
      <div className="hidden md:block w-60 border-r" style={{ background: 'rgba(16,16,20,0.98)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="p-4 space-y-3">
          <div className="h-8 w-8 rounded-lg bg-white/5 animate-pulse" />
          <div className="space-y-2 mt-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-white/[0.03] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        </div>
      </div>
      {/* Main content skeleton */}
      <div className="flex-1 p-6 space-y-6">
        <div className="h-10 w-64 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/[0.03] animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
        <div className="h-16 rounded-2xl bg-white/[0.03] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-white/[0.03] animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
