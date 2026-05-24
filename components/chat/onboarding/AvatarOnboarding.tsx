'use client';

/**
 * AvatarOnboarding — the first-run "wow" gate.
 *
 * Plays the real, professionally-voiced Georgian intro film (AvatarVideoStage) as
 * the greeting, then blocks the composer until the user names their avatar. On
 * commit it hands the name back to the parent, which persists `avatar_name` +
 * flips `is_avatar_named`.
 *
 * The greeting voice is the genuine recording embedded in the film — no neutral /
 * robotic TTS is used here.
 */

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { AvatarVideoStage } from '@/components/chat/onboarding/AvatarVideoStage';

export function AvatarOnboarding({ onNamed }: { onNamed: (name: string) => void }) {
  const [name, setName] = useState('');

  const commit = useCallback(() => {
    const n = name.trim();
    if (!n) return;
    onNamed(n.slice(0, 40));
  }, [name, onNamed]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-7 px-5 py-8 text-center bg-black overflow-y-auto"
      role="dialog" aria-modal="true"
    >
      {/* Marine aura backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: 'radial-gradient(60% 50% at 50% 32%, rgba(14,165,233,0.18), transparent 70%)' }} />

      {/* Cinematic intro film — real Georgian voice + captions */}
      <AvatarVideoStage />

      {/* Naming gate */}
      <motion.div
        initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25, duration: 0.5 }}
        className="relative w-full max-w-sm"
      >
        <p className="mb-3 text-[15px] sm:text-[16px] font-medium text-white/85">
          მოდი დავიწყოთ — დაარქვი სახელი შენს ავატარს ✨
        </p>
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
