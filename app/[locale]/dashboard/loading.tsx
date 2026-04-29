export default function DashboardLoading() {
  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#0a0a0f' }}>
      {/* Top bar skeleton */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(10,10,15,0.95)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/[0.05] animate-pulse" />
          <div className="w-24 h-4 rounded-lg bg-white/[0.04] animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-28 h-7 rounded-xl bg-white/[0.04] animate-pulse hidden sm:block" />
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] animate-pulse" />
        </div>
      </div>

      {/* Chat area skeleton */}
      <div className="flex-1 overflow-hidden flex flex-col px-4 py-6 gap-4 max-w-3xl w-full mx-auto">
        {/* AI bubble */}
        <div className="flex items-end gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 animate-pulse flex-shrink-0" />
          <div className="space-y-2 flex-1 max-w-md">
            <div className="h-4 rounded-xl bg-white/[0.05] animate-pulse" style={{ animationDelay: '60ms' }} />
            <div className="h-4 rounded-xl bg-white/[0.04] animate-pulse w-4/5" style={{ animationDelay: '120ms' }} />
            <div className="h-4 rounded-xl bg-white/[0.03] animate-pulse w-3/5" style={{ animationDelay: '180ms' }} />
          </div>
        </div>

        {/* User bubble */}
        <div className="flex items-end gap-3 justify-end mt-4">
          <div className="space-y-2 max-w-xs">
            <div className="h-4 rounded-xl bg-indigo-500/10 animate-pulse" style={{ animationDelay: '80ms' }} />
            <div className="h-4 rounded-xl bg-indigo-500/08 animate-pulse w-3/4 ml-auto" style={{ animationDelay: '140ms' }} />
          </div>
        </div>

        {/* AI bubble 2 */}
        <div className="flex items-end gap-3 mt-4">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 animate-pulse flex-shrink-0" />
          <div className="space-y-2 flex-1 max-w-lg">
            <div className="h-4 rounded-xl bg-white/[0.05] animate-pulse" style={{ animationDelay: '100ms' }} />
            <div className="h-4 rounded-xl bg-white/[0.04] animate-pulse w-5/6" style={{ animationDelay: '160ms' }} />
          </div>
        </div>
      </div>

      {/* Input skeleton */}
      <div className="flex-shrink-0 px-4 pb-6 max-w-3xl w-full mx-auto">
        <div
          className="rounded-2xl h-14 animate-pulse"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        />
      </div>
    </div>
  )
}
