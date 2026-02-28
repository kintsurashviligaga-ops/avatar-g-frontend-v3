'use client'
import { useState } from 'react'
import { ProfitCalculator } from './ProfitCalculator'

const SOURCE_PLATFORMS = [
  { value: 'amazon', label: 'Amazon' },
  { value: 'alibaba', label: 'Alibaba' },
  { value: 'aliexpress', label: 'AliExpress' },
  { value: 'temu', label: 'Temu' },
  { value: 'ebay', label: 'eBay' },
  { value: 'etsy', label: 'Etsy' },
  { value: 'facebook_marketplace', label: 'Facebook Marketplace' },
  { value: 'manual', label: 'Manual' },
  { value: 'other', label: 'Other' },
] as const

const TARGET_PLATFORMS = [
  { value: 'mymarket_ge', label: 'MyMarket.ge' },
  { value: 'ssx_ge', label: 'SS.ge' },
  { value: 'zoommer_ge', label: 'Zoommer.ge' },
  { value: 'vendoo_ge', label: 'Vendoo.ge' },
  { value: 'manual', label: 'Manual' },
  { value: 'own_site', label: 'Own Site' },
] as const

const SHIPPING_PARTNERS = [
  { value: 'georgian_post', label: 'Georgian Post' },
  { value: 'dhl', label: 'DHL' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'ups', label: 'UPS' },
  { value: 'aramex', label: 'Aramex' },
  { value: 'local_courier', label: 'Local Courier' },
  { value: 'manual', label: 'Manual' },
] as const

interface Props { userId: string }

export function ProductAnalyzer({ userId: _userId }: Props) {
  const [mode, setMode] = useState<'url' | 'manual'>('manual')
  const [projectId, setProjectId] = useState('')
  const [showCalc, setShowCalc] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceNotes, setSourceNotes] = useState('')
  const [sourcePlatform, setSourcePlatform] = useState('manual')
  const [targetPlatform, setTargetPlatform] = useState('mymarket_ge')
  const [shippingPartner, setShippingPartner] = useState('manual')
  const [units, setUnits] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const inputClass = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20'
  const selectClass = `${inputClass} appearance-none cursor-pointer`

  const submitItem = async () => {
    if (!title.trim() || !projectId.trim()) {
      setResult('Please provide a title and project ID.')
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/business/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId.trim(),
          title: title.trim(),
          source_platform: sourcePlatform,
          source_url: mode === 'url' ? sourceUrl.trim() : undefined,
          source_notes: sourceNotes.trim() || undefined,
          target_platform: targetPlatform,
          shipping_partner: shippingPartner,
          units,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setResult(`Item created: ${json.item?.id}`)
        setTitle('')
        setSourceUrl('')
        setSourceNotes('')
      } else {
        setResult(`Error: ${json.error}`)
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Add Product</h3>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('url')}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
              mode === 'url' ? 'border-white/30 bg-white/10 text-white' : 'border-white/[0.08] text-white/40 hover:text-white'
            }`}
          >
            Paste URL
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
              mode === 'manual' ? 'border-white/30 bg-white/10 text-white' : 'border-white/[0.08] text-white/40 hover:text-white'
            }`}
          >
            Manual Entry
          </button>
        </div>

        {/* Project ID */}
        <div>
          <label className="text-xs text-white/40 block mb-1">Project ID *</label>
          <input value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="Paste your project UUID" className={inputClass} />
        </div>

        {/* Title */}
        <div>
          <label className="text-xs text-white/40 block mb-1">Product Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Wireless Earbuds BT5.3" className={inputClass} />
        </div>

        {mode === 'url' && (
          <div>
            <label className="text-xs text-white/40 block mb-1">Source URL</label>
            <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://..." className={inputClass} />
          </div>
        )}

        <div>
          <label className="text-xs text-white/40 block mb-1">Notes</label>
          <textarea value={sourceNotes} onChange={e => setSourceNotes(e.target.value)} placeholder="Additional notes..." rows={2} className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/40 block mb-1">Source Platform</label>
            <select value={sourcePlatform} onChange={e => setSourcePlatform(e.target.value)} className={selectClass}>
              {SOURCE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Target Platform</label>
            <select value={targetPlatform} onChange={e => setTargetPlatform(e.target.value)} className={selectClass}>
              {TARGET_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Shipping Partner</label>
            <select value={shippingPartner} onChange={e => setShippingPartner(e.target.value)} className={selectClass}>
              {SHIPPING_PARTNERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Units</label>
            <input type="number" min={1} value={units} onChange={e => setUnits(Number(e.target.value))} className={inputClass} />
          </div>
        </div>

        <button
          onClick={submitItem}
          disabled={submitting}
          className="w-full bg-white text-[#050510] font-semibold text-sm py-2.5 rounded-xl hover:bg-white/90 transition-colors disabled:opacity-40"
        >
          {submitting ? 'Adding...' : 'Add Product Item'}
        </button>

        {result && (
          <p className={`text-xs ${result.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{result}</p>
        )}
      </div>

      {/* Profit Calculator toggle */}
      <div>
        <button
          onClick={() => setShowCalc(!showCalc)}
          className="text-sm text-white/50 hover:text-white transition-colors"
        >
          {showCalc ? '▼ Hide Profit Calculator' : '▶ Show Profit Calculator'}
        </button>
        {showCalc && projectId && (
          <div className="mt-3">
            <ProfitCalculator projectId={projectId} />
          </div>
        )}
        {showCalc && !projectId && (
          <p className="text-xs text-white/30 mt-2">Enter a Project ID above to use the calculator.</p>
        )}
      </div>
    </div>
  )
}
