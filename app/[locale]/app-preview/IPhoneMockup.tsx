'use client'

import { useState } from 'react'

/* ═══════════════════════════════════════════════════════════════
 *  IPhoneMockup — Pixel-perfect Agent G chat UI
 *  iPhone 16/17 full-screen mockup (393×852 logical points)
 *  Dark theme, Georgian locale, 2026 Grok-class design
 * ═══════════════════════════════════════════════════════════════ */

export function IPhoneMockup() {
  const [modeOpen, setModeOpen] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'heavy' | 'expert' | 'fast' | 'auto'>('fast')

  return (
    <div className="relative flex flex-col select-none" style={{
      width: 393,
      height: 852,
      borderRadius: 50,
      overflow: 'hidden',
      background: '#000000',
      boxShadow: '0 40px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.04)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
    }}>
      {/* ── Dynamic Island ── */}
      <div className="absolute top-0 left-0 right-0 flex justify-center z-50 pt-[11px]">
        <div style={{
          width: 126,
          height: 37,
          borderRadius: 20,
          background: '#000',
        }} />
      </div>

      {/* ── Status Bar ── */}
      <StatusBar />

      {/* ── Content Area ── */}
      <div className="flex flex-col flex-1 min-h-0" style={{
        background: 'linear-gradient(180deg, #000000 0%, #050510 50%, #0a0a18 100%)',
      }}>
        {/* Header */}
        <Header />

        {/* Chat Messages (scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 pb-3" style={{ scrollbarWidth: 'none' }}>
          <ChatMessages />
        </div>

        {/* Response Toolbar */}
        <ResponseToolbar />

        {/* Mode Selector Overlay */}
        {modeOpen && (
          <ModeSelector
            selected={selectedMode}
            onSelect={(m) => { setSelectedMode(m); setModeOpen(false) }}
            onClose={() => setModeOpen(false)}
          />
        )}

        {/* Bottom Input Bar */}
        <InputBar onModePress={() => setModeOpen(true)} selectedMode={selectedMode} />
      </div>

      {/* ── Home Indicator ── */}
      <div className="absolute bottom-[8px] left-1/2 -translate-x-1/2 z-50">
        <div style={{ width: 134, height: 5, borderRadius: 100, background: 'rgba(255,255,255,0.25)' }} />
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════
 *  STATUS BAR
 * ═══════════════════════════════════════════════════════════ */
function StatusBar() {
  return (
    <div className="relative flex items-center justify-between px-8 z-40" style={{ height: 54, paddingTop: 14 }}>
      {/* Time */}
      <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: 0.3 }}>9:41</span>
      {/* Right icons */}
      <div className="flex items-center gap-[5px]">
        {/* Signal */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0" y="8" width="3" height="4" rx="0.5" fill="#fff" />
          <rect x="4.5" y="5" width="3" height="7" rx="0.5" fill="#fff" />
          <rect x="9" y="2" width="3" height="10" rx="0.5" fill="#fff" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="#fff" />
        </svg>
        {/* WiFi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path d="M8 11.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill="#fff"/>
          <path d="M4.5 7.5a5 5 0 017 0" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/>
          <path d="M2 4.8a8.5 8.5 0 0112 0" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        {/* Battery */}
        <svg width="27" height="12" viewBox="0 0 27 12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="2.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1"/>
          <rect x="2" y="2" width="17" height="8" rx="1.5" fill="#34D399"/>
          <path d="M24 4v4a2 2 0 000-4z" fill="rgba(255,255,255,0.35)"/>
        </svg>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════
 *  HEADER
 * ═══════════════════════════════════════════════════════════ */
function Header() {
  return (
    <div className="flex items-center justify-between px-4" style={{
      height: 56,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Back */}
      <button className="flex items-center justify-center" style={{ width: 36, height: 36 }}>
        <svg width="10" height="18" viewBox="0 0 10 18" fill="none">
          <path d="M9 1L1 9l8 8" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Center: Agent G identity */}
      <div className="flex items-center gap-2.5">
        {/* Diamond logo */}
        <div className="relative flex items-center justify-center" style={{ width: 32, height: 32 }}>
          <div style={{
            width: 24,
            height: 24,
            transform: 'rotate(45deg)',
            borderRadius: 6,
            background: 'linear-gradient(135deg, #22D3EE, #06B6D4)',
            boxShadow: '0 0 16px rgba(34,211,238,0.4)',
          }} />
          <span className="absolute" style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>G</span>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: -0.2 }}>
            აგენტი G
          </div>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.2 }}>
            შენი AI დამხმარე
          </div>
        </div>
      </div>

      {/* Menu */}
      <button className="flex flex-col items-center justify-center gap-[4px]" style={{ width: 36, height: 36 }}>
        <span style={{ width: 18, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.5)' }} />
        <span style={{ width: 18, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.5)' }} />
        <span style={{ width: 18, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.5)' }} />
      </button>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════
 *  CHAT MESSAGES
 * ═══════════════════════════════════════════════════════════ */
function ChatMessages() {
  return (
    <div className="flex flex-col gap-4 pt-4">
      {/* User message 1 */}
      <UserBubble text="გამარჯობა! მინდა შევქმნა პროფესიონალური ავატარი ჩემი ბრენდისთვის." />

      {/* Agent G response 1 */}
      <AgentBubble>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.88)' }}>
          გამარჯობა! 👋 სიამოვნებით დაგეხმარები ბრენდის ავატარის შექმნაში.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.88)', marginTop: 10 }}>
          აი რა შემიძლია შემოგთავაზო:
        </p>
        <div style={{ marginTop: 8, paddingLeft: 6 }}>
          {[
            '**AI პორტრეტი** — ფოტორეალისტური სახე',
            '**3D ავატარი** — ანიმირებული პერსონაჟი',
            '**ბრენდ ავატარი** — კორპორატიული სტილი',
            '**კარიკატურა** — უნიკალური არტ სტილი',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2" style={{ marginTop: i ? 6 : 0 }}>
              <span style={{ color: '#22D3EE', fontSize: 6, marginTop: 7 }}>●</span>
              <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.78)' }}
                dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<span style="color:#fff;font-weight:600">$1</span>') }}
              />
            </div>
          ))}
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.88)', marginTop: 12 }}>
          რომელი ტიპი გაინტერესებს? 🎨
        </p>
      </AgentBubble>

      {/* User message 2 */}
      <UserBubble text="AI პორტრეტი მინდა, მინიმალისტურ სტილში." />

      {/* Agent G response 2 (last — toolbar will follow) */}
      <AgentBubble>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.88)' }}>
          შესანიშნავი არჩევანი! 🎯 მინიმალისტური AI პორტრეტის შესაქმნელად მჭირდება:
        </p>
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <code style={{ fontSize: 12, fontFamily: 'SF Mono, Menlo, monospace', color: '#22D3EE', lineHeight: 1.7 }}>
            📸 შენი ფოტო (1-3 ცალი)<br/>
            🎨 სასურველი ფონის ფერი<br/>
            👔 სტილი: კორპორატიული / კრეატიული<br/>
            📐 ზომა: 1024×1024 / 512×512
          </code>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.88)', marginTop: 12 }}>
          ატვირთე ფოტო და დავიწყოთ! ⚡
        </p>
      </AgentBubble>
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div style={{
        maxWidth: '78%',
        padding: '11px 15px',
        borderRadius: '20px 20px 4px 20px',
        background: 'linear-gradient(135deg, #0E7490, #155E75)',
        boxShadow: '0 2px 12px rgba(14,116,144,0.25)',
      }}>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: '#fff', fontWeight: 400 }}>{text}</span>
      </div>
    </div>
  )
}

function AgentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      {/* Agent G avatar */}
      <div className="shrink-0 relative flex items-center justify-center" style={{
        width: 30,
        height: 30,
        marginTop: 2,
      }}>
        <div style={{
          width: 22,
          height: 22,
          transform: 'rotate(45deg)',
          borderRadius: 5,
          background: 'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(6,182,212,0.12))',
          border: '1px solid rgba(34,211,238,0.2)',
        }} />
        <span className="absolute" style={{ fontSize: 10, fontWeight: 800, color: '#22D3EE' }}>G</span>
      </div>
      {/* Bubble */}
      <div style={{
        maxWidth: '82%',
        padding: '12px 14px',
        borderRadius: '4px 20px 20px 20px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      }}>
        {children}
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════
 *  RESPONSE TOOLBAR (7 icons + timing)
 * ═══════════════════════════════════════════════════════════ */
function ResponseToolbar() {
  const icons = [
    // 1. Copy
    <svg key="copy" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>,
    // 2. Share
    <svg key="share" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
    </svg>,
    // 3. Thumbs up
    <svg key="up" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/><path d="M14.5 2.3L10 11v11h9.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14.5z"/>
    </svg>,
    // 4. Thumbs down
    <svg key="down" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3"/><path d="M9.5 21.7L14 13V2H4.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H9.5z"/>
    </svg>,
    // 5. Speaker
    <svg key="speaker" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/>
    </svg>,
    // 6. Regenerate
    <svg key="regen" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
    </svg>,
    // 7. More
    <svg key="more" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
    </svg>,
  ]

  return (
    <div style={{
      height: 48,
      marginLeft: 4,
      marginRight: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 16,
      paddingRight: 16,
      borderTop: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(28,28,30,0.85)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRadius: 0,
      boxShadow: '0 -0.5px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Icons */}
      <div className="flex items-center" style={{ gap: 12, color: '#A1A1A7' }}>
        {icons.map((icon, i) => (
          <button key={i} className="flex items-center justify-center transition-transform active:scale-[0.92]" style={{ width: 28, height: 28 }}>
            {icon}
          </button>
        ))}
      </div>
      {/* Timing */}
      <div className="flex items-center gap-1" style={{ fontSize: 13, color: '#8E8E93', fontWeight: 500 }}>
        <span>Fast</span>
        <span style={{ fontSize: 6, verticalAlign: 'middle' }}>•</span>
        <span>19.82s</span>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════
 *  BOTTOM INPUT BAR
 * ═══════════════════════════════════════════════════════════ */
function InputBar({ onModePress, selectedMode }: { onModePress: () => void; selectedMode: string }) {
  return (
    <div style={{
      paddingBottom: 34, // safe area
      paddingTop: 8,
      paddingLeft: 12,
      paddingRight: 12,
      background: 'rgba(20,20,22,0.92)',
      backdropFilter: 'blur(30px)',
      WebkitBackdropFilter: 'blur(30px)',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    }}>
      {/* Text Field */}
      <div style={{
        height: 50,
        borderRadius: 25,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 20,
        paddingRight: 16,
        boxShadow: '0 2px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
        <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.22)', fontWeight: 400, letterSpacing: -0.2 }}>
          Ask Anything
        </span>
      </div>

      {/* Bottom action row */}
      <div className="flex items-center justify-between" style={{ marginTop: 10, paddingLeft: 4, paddingRight: 4 }}>
        {/* Left group */}
        <div className="flex items-center gap-2">
          {/* Mic 1 */}
          <ActionPill>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1A7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </ActionPill>

          {/* Fast mode button */}
          <button
            onClick={onModePress}
            className="flex items-center gap-1.5 transition-transform active:scale-[0.95]"
            style={{
              height: 34,
              paddingLeft: 10,
              paddingRight: 12,
              borderRadius: 17,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span style={{ fontSize: 13 }}>⚡</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', textTransform: 'capitalize' }}>
              {selectedMode === 'fast' ? 'Fast' : selectedMode === 'expert' ? 'Expert' : selectedMode === 'heavy' ? 'Heavy' : 'Auto'}
            </span>
          </button>

          {/* Mic 2 / Attachment */}
          <ActionPill>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1A7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
          </ActionPill>
        </div>

        {/* Speak button */}
        <button className="flex items-center gap-1.5 transition-transform active:scale-[0.95]" style={{
          height: 36,
          paddingLeft: 14,
          paddingRight: 16,
          borderRadius: 18,
          background: '#fff',
          boxShadow: '0 2px 12px rgba(255,255,255,0.12)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="4" height="12" rx="1"/><rect x="10" y="3" width="4" height="18" rx="1"/><rect x="18" y="8" width="4" height="8" rx="1"/>
          </svg>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>Speak</span>
        </button>
      </div>
    </div>
  )
}

function ActionPill({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex items-center justify-center transition-transform active:scale-[0.92]" style={{
      width: 34,
      height: 34,
      borderRadius: 17,
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {children}
    </button>
  )
}


/* ═══════════════════════════════════════════════════════════
 *  MODE SELECTOR (Bottom Sheet)
 * ═══════════════════════════════════════════════════════════ */
function ModeSelector({
  selected,
  onSelect,
  onClose,
}: {
  selected: string
  onSelect: (m: 'heavy' | 'expert' | 'fast' | 'auto') => void
  onClose: () => void
}) {
  const modes: { id: 'heavy' | 'expert' | 'fast' | 'auto'; icon: string; label: string; sub: string }[] = [
    { id: 'heavy', icon: '□□', label: 'Heavy', sub: 'Powered by Grok 4.20' },
    { id: 'expert', icon: '💡', label: 'Expert', sub: 'Thinks hard' },
    { id: 'fast', icon: '⚡', label: 'Fast', sub: 'Quick responses' },
    { id: 'auto', icon: '🚀', label: 'Auto', sub: 'Chooses Fast or Expert' },
  ]

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />

      {/* Sheet */}
      <div className="relative" style={{
        background: 'rgba(28,28,30,0.97)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        borderRadius: '20px 20px 0 0',
        paddingBottom: 40,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Grip bar */}
        <div className="flex justify-center pt-3 pb-3">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Done button */}
        <div className="flex justify-end px-5 pb-2">
          <button onClick={onClose} style={{ fontSize: 16, fontWeight: 600, color: '#22D3EE' }}>Done</button>
        </div>

        {/* Mode list */}
        <div className="px-4 flex flex-col gap-2 pb-2">
          {modes.map((m) => {
            const isSelected = selected === m.id
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                className="flex items-center gap-3 w-full text-left transition-all active:scale-[0.98]"
                style={{
                  padding: '14px 16px',
                  borderRadius: 16,
                  background: isSelected ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.04)',
                  border: isSelected ? '1px solid rgba(34,211,238,0.2)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{m.icon}</span>
                <div className="flex-1">
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{m.sub}</div>
                </div>
                {isSelected && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
