'use client';

/**
 * AvatarOnboarding — the first-run "wow" gate.
 *
 * Blocks the composer until the user names their avatar. Renders a premium
 * marine-themed animated orb + the Georgian intro script (speakable via the live
 * ElevenLabs TTS engine), then a name input. On commit it hands the name back to
 * the parent, which persists `avatar_name` + flips `is_avatar_named`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Volume2, Loader2, Square } from 'lucide-react';
import { AvatarVideoStage } from '@/components/chat/onboarding/AvatarVideoStage';

const INTRO_KA =
  'გამარჯობა! მე ვარ შენი პერსონალური ციფრული ავატარი და ამავდროულად — შენი უძლიერესი AI აგენტი. მე შემიძლია ყველაფერი, რაც კი აგენტს შეუძლია: დაგიპროექტებ 3D ინტერიერს, შევქმნი კინემატოგრაფიულ ფილმებს და ვილაპარაკებ ნებისმიერ ენაზე. თუმცა, სანამ დავიწყებთ... მითხარი, რა დამარქვი?';

export function AvatarOnboarding({ onNamed }: { onNamed: (name: string) => void }) {
  const [name, setName] = useState('');
  const [voice, setVoice] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const speak = useCallback(async () => {
    try {
      if (voice === 'loading') return;
      if (voice === 'playing') {
        try { const a = audioRef.current; if (a) { a.pause(); a.currentTime = 0; } } catch { /* noop */ }
        setVoice('idle');
        return;
      }
      if (audioRef.current && urlRef.current) {
        audioRef.current.onended = () => setVoice('idle');
        audioRef.current.play().then(() => setVoice('playing')).catch(() => setVoice('idle'));
        return;
      }
      setVoice('loading');
      const res = await fetch('/api/elevenlabs/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: INTRO_KA.slice(0, 800), locale: 'ka' }),
      });
      if (!res.ok) { setVoice('idle'); return; }
      const blob = await res.blob();
      if (!blob.size) { setVoice('idle'); return; }
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setVoice('idle');
      audio.play().then(() => setVoice('playing')).catch(() => setVoice('idle'));
    } catch { setVoice('idle'); }
  }, [voice]);

  // Auto-greet on mount: the muted avatar video autoplays (browser-allowed); the
  // voice is attempted too and gracefully no-ops if the browser blocks autoplay
  // audio (the "მომისმინე" button then plays it on the first tap).
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    void speak();
  }, [speak]);

  const commit = useCallback(() => {
    const n = name.trim();
    if (!n) return;
    try { audioRef.current?.pause(); } catch { /* noop */ }
    if (urlRef.current) { try { URL.revokeObjectURL(urlRef.current); } catch { /* noop */ } }
    onNamed(n.slice(0, 40));
  }, [name, onNamed]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center px-5 text-center bg-black"
      role="dialog" aria-modal="true"
    >
      {/* Marine aura backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: 'radial-gradient(60% 50% at 50% 38%, rgba(14,165,233,0.18), transparent 70%)' }} />

      {/* Talking avatar video viewport — speaks in sync with the premium voice. */}
      <div className="relative mb-7">
        <AvatarVideoStage speaking={voice === 'playing'} />
      </div>

      {/* Intro script + speak control */}
      <motion.p
        initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.5 }}
        className="relative max-w-xl text-[15px] sm:text-[16px] leading-relaxed text-white/90"
      >
        {INTRO_KA}
      </motion.p>

      <button
        type="button" onClick={() => void speak()}
        className="relative mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-full border border-sky-400/30 bg-white/[0.04] text-[12px] font-semibold text-sky-200 hover:border-sky-300/50 hover:bg-white/[0.08] transition active:scale-95"
      >
        {voice === 'loading' ? <Loader2 size={14} className="animate-spin" /> : voice === 'playing' ? <Square size={13} className="fill-current" /> : <Volume2 size={14} />}
        {voice === 'playing' ? 'გაჩერება' : 'მომისმინე'}
      </button>

      {/* Naming input */}
      <motion.div
        initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }}
        className="relative mt-8 w-full max-w-sm"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          maxLength={40}
          autoFocus
          placeholder="ჩაწერე ჩემი სახელი აქ..."
          aria-label="avatar name"
          className="w-full text-center bg-white/[0.05] border border-sky-400/25 rounded-2xl px-4 py-3.5 text-[16px] font-medium text-white placeholder:text-white/40 outline-none focus:border-sky-300/50 focus:ring-2 focus:ring-sky-500/25 transition"
        />
        <button
          type="button" onClick={commit} disabled={!name.trim()}
          className={`mt-3 w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl font-bold text-[15px] transition-all duration-300 ease-in-out ${
            name.trim()
              ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-white hover:from-cyan-300 hover:to-blue-500 shadow-[0_8px_30px_-8px_rgba(56,189,248,0.7)] active:scale-[0.99]'
              : 'bg-white/[0.05] border border-white/[0.10] text-white/35 cursor-not-allowed'
          }`}
        >
          დაარქვი სახელი ✨
        </button>
      </motion.div>
    </motion.div>
  );
}
