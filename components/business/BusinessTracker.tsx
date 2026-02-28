'use client'
import { useState, useEffect, useCallback } from 'react'

interface Item {
  id: string
  title: string
  status: string
  source_platform: string
  target_platform: string
  shipping_partner: string
  tracking_number: string | null
  units: number
  listing_url: string | null
  created_at: string
  events?: ItemEvent[]
}

interface ItemEvent {
  id: string
  status: string
  note: string | null
  actor: string
  created_at: string
}

const STATUS_ORDER = [
  'planned', 'sourced', 'payment_pending', 'shipped', 'in_transit',
  'customs', 'arrived', 'listed', 'sold', 'payout_pending', 'payout_received',
] as const

const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-gray-500/20 text-gray-400',
  sourced: 'bg-blue-500/20 text-blue-400',
  payment_pending: 'bg-yellow-500/20 text-yellow-400',
  shipped: 'bg-indigo-500/20 text-indigo-400',
  in_transit: 'bg-purple-500/20 text-purple-400',
  customs: 'bg-orange-500/20 text-orange-400',
  arrived: 'bg-teal-500/20 text-teal-400',
  listed: 'bg-cyan-500/20 text-cyan-400',
  sold: 'bg-green-500/20 text-green-400',
  payout_pending: 'bg-amber-500/20 text-amber-400',
  payout_received: 'bg-emerald-500/20 text-emerald-400',
  cancelled: 'bg-red-500/20 text-red-400',
  returned: 'bg-rose-500/20 text-rose-400',
}

interface Props { userId: string }

export function BusinessTracker({ userId: _userId }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [events, setEvents] = useState<Record<string, ItemEvent[]>>({})
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({})

  // We fetch items through the project detail endpoint since items live under projects.
  // For the tracker, we fetch all projects and flatten items.
  const loadItems = useCallback(async () => {
    try {
      const res = await fetch('/api/business/projects')
      if (!res.ok) return
      const json = await res.json()
      const allItems: Item[] = []
      for (const project of json.projects ?? []) {
        const detailRes = await fetch(`/api/business/projects/${project.id}`)
        if (detailRes.ok) {
          const detail = await detailRes.json()
          const projectItems = detail.project?.business_items ?? []
          allItems.push(...projectItems)
        }
      }
      setItems(allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  const updateStatus = async (itemId: string, newStatus: string) => {
    setStatusUpdating(itemId)
    try {
      const res = await fetch(`/api/business/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: newStatus } : i))
      }
    } finally {
      setStatusUpdating(null)
    }
  }

  const updateTracking = async (itemId: string) => {
    const tracking = trackingInputs[itemId]
    if (!tracking?.trim()) return
    const res = await fetch(`/api/business/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_number: tracking.trim() }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, tracking_number: tracking.trim() } : i))
      setTrackingInputs(prev => ({ ...prev, [itemId]: '' }))
    }
  }

  const loadEvents = async (itemId: string) => {
    // Events are loaded via the project detail — for now show what we have
    // In production, a dedicated events endpoint would be used
    if (events[itemId]) return
    setEvents(prev => ({ ...prev, [itemId]: [] }))
  }

  const toggleExpand = (itemId: string) => {
    if (expandedItem === itemId) {
      setExpandedItem(null)
    } else {
      setExpandedItem(itemId)
      loadEvents(itemId)
    }
  }

  const inputClass = 'bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/20'

  if (loading) return <p className="text-sm text-white/30">Loading items...</p>

  if (items.length === 0) {
    return (
      <div className="border-2 border-dashed border-white/[0.06] rounded-xl p-8 text-center">
        <p className="text-sm text-white/30">No items yet. Add products in the Product Analyzer tab.</p>
      </div>
    )
  }

  // Group by status
  const grouped = new Map<string, Item[]>()
  for (const item of items) {
    const group = grouped.get(item.status) ?? []
    group.push(item)
    grouped.set(item.status, group)
  }

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Item Tracker</h3>

      {STATUS_ORDER.filter(s => grouped.has(s)).map(status => (
        <div key={status}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-white/10 text-white/40'}`}>
              {status.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-white/30">{grouped.get(status)?.length ?? 0} items</span>
          </div>
          <div className="space-y-2">
            {grouped.get(status)?.map(item => (
              <div key={item.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(item.id)}>
                  <div>
                    <p className="text-sm text-white">{item.title}</p>
                    <p className="text-xs text-white/30">{item.source_platform} → {item.target_platform} · {item.units} units</p>
                  </div>
                  <span className="text-white/20 text-xs">{expandedItem === item.id ? '▼' : '▶'}</span>
                </div>

                {expandedItem === item.id && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                    {/* Status update */}
                    <div>
                      <label className="text-xs text-white/40 block mb-1">Update Status</label>
                      <div className="flex flex-wrap gap-1">
                        {STATUS_ORDER.map(s => (
                          <button
                            key={s}
                            onClick={() => updateStatus(item.id, s)}
                            disabled={statusUpdating === item.id || item.status === s}
                            className={`text-xs px-2 py-0.5 rounded-lg border transition-all ${
                              item.status === s
                                ? 'border-white/30 bg-white/10 text-white'
                                : 'border-white/[0.06] text-white/30 hover:text-white/60 hover:border-white/[0.12]'
                            }`}
                          >
                            {s.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tracking number */}
                    <div>
                      <label className="text-xs text-white/40 block mb-1">
                        Tracking: {item.tracking_number ?? 'None'}
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={trackingInputs[item.id] ?? ''}
                          onChange={e => setTrackingInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Enter tracking number"
                          className={inputClass}
                        />
                        <button
                          onClick={() => updateTracking(item.id)}
                          className="text-xs px-3 py-1 bg-white/[0.06] rounded-lg text-white/60 hover:text-white transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>

                    {/* Events timeline */}
                    {(() => {
                      const itemEvents = events[item.id]
                      if (!itemEvents || itemEvents.length === 0) return null
                      return (
                        <div>
                          <label className="text-xs text-white/40 block mb-1">Timeline</label>
                          <div className="space-y-1">
                            {itemEvents.map(ev => (
                              <div key={ev.id} className="flex items-center gap-2 text-xs">
                                <span className="text-white/20">{new Date(ev.created_at).toLocaleDateString()}</span>
                                <span className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[ev.status] ?? 'bg-white/10 text-white/40'}`}>
                                  {ev.status}
                                </span>
                                {ev.note && <span className="text-white/40">{ev.note}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {item.listing_url && (
                      <p className="text-xs text-white/40">
                        Listing: <a href={item.listing_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{item.listing_url}</a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Cancelled / Returned */}
      {['cancelled', 'returned'].filter(s => grouped.has(s)).map(status => (
        <div key={status}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
              {status}
            </span>
            <span className="text-xs text-white/30">{grouped.get(status)?.length ?? 0}</span>
          </div>
          <div className="space-y-2">
            {grouped.get(status)?.map(item => (
              <div key={item.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 opacity-60">
                <p className="text-sm text-white">{item.title}</p>
                <p className="text-xs text-white/30">{item.units} units</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
