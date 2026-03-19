'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'

interface CallScreenProps {
  open: boolean
  onClose: () => void
  onSendVoiceMessage?: (text: string) => void
}

export function CallScreen({ open, onClose, onSendVoiceMessage }: CallScreenProps) {
  const [callState, setCallState] = useState<'ringing' | 'connected' | 'ended'>('ringing')
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeaker, setIsSpeaker] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* Auto-connect after 2s ring */
  useEffect(() => {
    if (!open) {
      setCallState('ringing')
      setDuration(0)
      return
    }
    const ring = setTimeout(() => setCallState('connected'), 2000)
    return () => clearTimeout(ring)
  }, [open])

  /* Duration timer */
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [callState])

  const handleEndCall = useCallback(() => {
    setCallState('ended')
    if (timerRef.current) clearInterval(timerRef.current)
    setTimeout(onClose, 600)
  }, [onClose])

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  if (!open) return null

  return (
    <div className="call-screen-overlay">
      <div className="call-screen">
        {/* Background effects */}
        <div className="call-screen-bg" aria-hidden="true">
          <div className="call-screen-ring call-screen-ring-1" />
          <div className="call-screen-ring call-screen-ring-2" />
          <div className="call-screen-ring call-screen-ring-3" />
        </div>

        {/* Agent avatar */}
        <div className="call-screen-avatar">
          <div className={`call-screen-avatar-glow ${callState === 'connected' ? 'active' : ''}`} />
          <div className="call-screen-avatar-img">
            <Image
              src="/brand/gemini-rocket-clean.png"
              alt="Agent G"
              width={80}
              height={80}
              className="object-contain"
            />
          </div>
        </div>

        {/* Status */}
        <div className="call-screen-info">
          <h3 className="text-[20px] font-bold text-white">Agent G</h3>
          <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
            MyAvatar.ge AI Assistant
          </p>
          <div className="call-screen-status">
            {callState === 'ringing' && (
              <span className="text-[14px] text-cyan-400 animate-pulse">Connecting…</span>
            )}
            {callState === 'connected' && (
              <span className="text-[14px] text-emerald-400">{formatDuration(duration)}</span>
            )}
            {callState === 'ended' && (
              <span className="text-[14px] text-white/40">Call ended</span>
            )}
          </div>
        </div>

        {/* Voice waveform visualization */}
        {callState === 'connected' && (
          <div className="call-screen-waveform">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="call-screen-wave-bar"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}

        {/* Control buttons */}
        <div className="call-screen-controls">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`call-control-btn ${isMuted ? 'active' : ''}`}
            type="button"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {isMuted ? (
                <>
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.34 2.18" />
                  <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                </>
              ) : (
                <>
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                </>
              )}
            </svg>
            <span className="text-[10px] mt-1">Mute</span>
          </button>

          <button
            onClick={() => setIsSpeaker(!isSpeaker)}
            className={`call-control-btn ${isSpeaker ? 'active' : ''}`}
            type="button"
            aria-label="Speaker"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
            <span className="text-[10px] mt-1">Speaker</span>
          </button>

          {/* End call */}
          <button
            onClick={handleEndCall}
            className="call-end-btn"
            type="button"
            aria-label="End call"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            </svg>
          </button>

          <button className="call-control-btn" type="button" aria-label="Keypad">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="4" y="4" width="4" height="4" rx="1" />
              <rect x="10" y="4" width="4" height="4" rx="1" />
              <rect x="16" y="4" width="4" height="4" rx="1" />
              <rect x="4" y="10" width="4" height="4" rx="1" />
              <rect x="10" y="10" width="4" height="4" rx="1" />
              <rect x="16" y="10" width="4" height="4" rx="1" />
              <rect x="4" y="16" width="4" height="4" rx="1" />
              <rect x="10" y="16" width="4" height="4" rx="1" />
              <rect x="16" y="16" width="4" height="4" rx="1" />
            </svg>
            <span className="text-[10px] mt-1">Keypad</span>
          </button>
        </div>
      </div>
    </div>
  )
}
