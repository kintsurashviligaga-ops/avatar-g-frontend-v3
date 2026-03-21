'use client'

/**
 * ImagineTab — Minimal "Create" tab. Video + Photo only.
 */

interface ImagineTabProps {
  onCreateAction: (templateId: string) => void
  onOpenSettings: () => void
  onFeaturedAction: () => void
}

const CREATE_OPTIONS = [
  {
    id: 'video',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" />
        <path d="m10 8 6 4-6 4z" />
      </svg>
    ),
    label: 'Video',
    desc: 'AI video generation & animation',
    color: '#f59e0b',
    gradient: 'linear-gradient(145deg, #1a1408, #3d2e0a)',
  },
  {
    id: 'photo',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    ),
    label: 'Photo / Image',
    desc: 'AI image creation & editing',
    color: '#f472b6',
    gradient: 'linear-gradient(145deg, #1a0818, #3d0c30)',
  },
]

export function ImagineTab({ onCreateAction }: ImagineTabProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 gap-6">
      <p className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: 'rgba(34,211,238,0.6)' }}>
        Create with AI
      </p>

      <div className="w-full max-w-sm flex flex-col gap-3">
        {CREATE_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => onCreateAction(opt.id)}
            type="button"
            className="group relative flex items-center gap-4 w-full px-5 py-5 rounded-2xl text-left transition-all duration-300 active:scale-[0.98] hover:scale-[1.01]"
            style={{
              background: opt.gradient,
              border: `1px solid ${opt.color}33`,
              boxShadow: `0 4px 24px ${opt.color}12`,
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110"
              style={{
                background: `linear-gradient(135deg, ${opt.color}25, ${opt.color}0a)`,
                border: `1px solid ${opt.color}40`,
                color: opt.color,
              }}
            >
              {opt.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-bold" style={{ color: 'rgba(255,255,255,0.92)' }}>
                {opt.label}
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {opt.desc}
              </div>
            </div>
            <svg className="ml-auto shrink-0 opacity-30 group-hover:opacity-60 transition-opacity" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
