'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import InlineMedia from '@/components/dashboard/command-center/InlineMedia';

type Personality = 'friendly' | 'professional' | 'funny' | 'custom';

type VoicePreset = {
  id: string;
  label: string;
  description: string;
};

type Props = {
  locale: string;
};

const PERSONALITY_CHOICES: Array<{
  id: Personality;
  emoji: string;
  label: string;
  description: string;
}> = [
  {
    id: 'friendly',
    emoji: 'Friendly',
    label: 'Friendly',
    description: 'თბილი, მეგობრული ტონი',
  },
  {
    id: 'professional',
    emoji: 'Pro',
    label: 'Professional',
    description: 'ფორმალური, საქმიანი',
  },
  {
    id: 'funny',
    emoji: 'Funny',
    label: 'Funny',
    description: 'მხიარული, იუმორით',
  },
  {
    id: 'custom',
    emoji: 'Custom',
    label: 'Custom',
    description: 'ჩაწერე საკუთარი',
  },
];

const VOICE_PRESETS: VoicePreset[] = [
  { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam', description: 'EN, male' },
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', description: 'EN, female' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella', description: 'EN, female, soft' },
];

const SAMPLE_TEXT = 'Hello! I am your AI avatar. Nice to meet you.';

const PERSONALITY_DEFAULT_PROMPT: Record<Exclude<Personality, 'custom'>, string> = {
  friendly: 'You are a warm, friendly assistant. Use a casual, welcoming tone.',
  professional: 'You are a professional assistant. Be precise, formal and concise.',
  funny: 'You are a witty assistant. Use light humor when appropriate.',
};

export default function OnboardingWizard({ locale }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [avatarName, setAvatarName] = useState('');
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-card preview state.
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const nameValid = avatarName.trim().length >= 2;
  const personalityValid = personality !== null && (personality !== 'custom' || customPrompt.trim().length > 0);

  const canContinue = useMemo(() => {
    if (step === 1) return nameValid;
    if (step === 2) return personalityValid;
    return true;
  }, [step, nameValid, personalityValid]);

  const handleNext = useCallback(() => {
    if (!canContinue) return;
    setError(null);
    if (step < 3) setStep((s) => (s + 1) as 1 | 2 | 3);
  }, [canContinue, step]);

  const handleBack = useCallback(() => {
    setError(null);
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3);
  }, [step]);

  const playPreview = useCallback(
    async (preset: VoicePreset) => {
      setPreviewError(null);
      setPreviewingId(preset.id);
      try {
        const cached = previewUrls[preset.id];
        if (cached) {
          if (audioRef.current) {
            audioRef.current.src = cached;
            await audioRef.current.play().catch(() => undefined);
          }
          return;
        }

        const res = await fetch('/api/elevenlabs/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: SAMPLE_TEXT, voice_id: preset.id }),
        });
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; audio?: string; error?: string }
          | null;

        if (!res.ok || !json?.audio) {
          setPreviewError(json?.error ?? 'Preview unavailable');
          return;
        }

        const url = `data:audio/mpeg;base64,${json.audio}`;
        setPreviewUrls((prev) => ({ ...prev, [preset.id]: url }));
        if (audioRef.current) {
          audioRef.current.src = url;
          await audioRef.current.play().catch(() => undefined);
        }
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        setPreviewingId(null);
      }
    },
    [previewUrls],
  );

  const finish = useCallback(
    async (chosenVoice: string | null, cloneLater: boolean) => {
      if (!personality || !nameValid) return;
      setSubmitting(true);
      setError(null);

      const systemPrompt =
        personality === 'custom'
          ? customPrompt.trim()
          : PERSONALITY_DEFAULT_PROMPT[personality];

      try {
        const res = await fetch('/api/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: avatarName.trim(),
            personality,
            voice_id: chosenVoice ?? null,
            system_prompt: systemPrompt || null,
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Save failed (${res.status})`);
        }

        const target = cloneLater ? `/${locale}/voice-lab` : `/${locale}/dashboard`;
        router.push(target);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
        setSubmitting(false);
      }
    },
    [avatarName, customPrompt, locale, nameValid, personality, router],
  );

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-950 via-zinc-950 to-violet-950/30 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-violet-300/80">
            Step {step} of 3
          </p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
            {step === 1 && 'Name your avatar'}
            {step === 2 && 'Choose a personality'}
            {step === 3 && 'Pick a voice'}
          </h1>
          <div className="mt-4 flex gap-2">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  n <= step ? 'bg-violet-400' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </header>

        <audio ref={audioRef} className="sr-only" preload="none" />

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.section
              key="step-1"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
            >
              <label className="block text-sm text-white/70" htmlFor="avatar-name">
                What should we call your avatar?
              </label>
              <input
                id="avatar-name"
                type="text"
                value={avatarName}
                onChange={(e) => setAvatarName(e.target.value)}
                placeholder="e.g. Nia, Agent G, Lumen…"
                className="mt-3 w-full rounded-xl border border-white/10 bg-zinc-900/60 px-5 py-4 text-lg text-white outline-none transition-colors placeholder:text-white/30 focus:border-violet-400/60 focus:bg-zinc-900"
                style={{ minHeight: 56 }}
                autoFocus
              />
              <p className="mt-2 text-xs text-white/40">At least 2 characters.</p>
            </motion.section>
          )}

          {step === 2 && (
            <motion.section
              key="step-2"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {PERSONALITY_CHOICES.map((choice) => {
                  const selected = personality === choice.id;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => setPersonality(choice.id)}
                      className={`group flex flex-col items-start gap-2 rounded-2xl border p-5 text-left transition-all ${
                        selected
                          ? 'border-violet-400/60 bg-violet-500/10 ring-2 ring-violet-400/40'
                          : 'border-white/10 bg-zinc-900/60 hover:border-white/20 hover:bg-zinc-900'
                      }`}
                      style={{ minHeight: 96 }}
                    >
                      <span className="text-xs font-semibold uppercase tracking-widest text-cyan-300/90">
                        {choice.emoji}
                      </span>
                      <span className="text-lg font-semibold">{choice.label}</span>
                      <span className="text-sm text-white/60">{choice.description}</span>
                    </button>
                  );
                })}
              </div>

              {personality === 'custom' && (
                <div className="mt-4">
                  <label className="block text-sm text-white/70" htmlFor="custom-prompt">
                    Custom system prompt
                  </label>
                  <textarea
                    id="custom-prompt"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Describe how your avatar should speak and behave…"
                    rows={5}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-base text-white outline-none transition-colors placeholder:text-white/30 focus:border-violet-400/60"
                  />
                </div>
              )}
            </motion.section>
          )}

          {step === 3 && (
            <motion.section
              key="step-3"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
            >
              <div className="space-y-3">
                {VOICE_PRESETS.map((preset) => {
                  const selected = voiceId === preset.id;
                  const isLoading = previewingId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`rounded-2xl border p-4 transition-all ${
                        selected
                          ? 'border-violet-400/60 bg-violet-500/10 ring-2 ring-violet-400/40'
                          : 'border-white/10 bg-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setVoiceId(preset.id)}
                          className="flex flex-1 flex-col items-start text-left"
                          style={{ minHeight: 48 }}
                        >
                          <span className="text-base font-semibold">{preset.label}</span>
                          <span className="text-sm text-white/60">{preset.description}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => playPreview(preset)}
                          disabled={isLoading}
                          className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-400/20 disabled:opacity-50"
                          style={{ minHeight: 48 }}
                        >
                          {isLoading ? 'Loading…' : 'Play'}
                        </button>
                      </div>
                      {previewUrls[preset.id] && (
                        <div className="mt-3">
                          <InlineMedia kind="audio" url={previewUrls[preset.id]!} />
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => finish(null, true)}
                  disabled={submitting || !personality || !nameValid}
                  className="w-full rounded-2xl border border-dashed border-white/20 bg-zinc-900/40 px-5 py-4 text-left transition-colors hover:border-white/40 hover:bg-zinc-900/70 disabled:opacity-50"
                  style={{ minHeight: 64 }}
                >
                  <span className="text-base font-semibold">Clone my voice later</span>
                  <span className="ml-2 text-sm text-white/60">
                    Skip and finish setup in Voice Lab.
                  </span>
                </button>
              </div>

              {previewError && (
                <p className="mt-3 text-xs text-amber-300/90">{previewError}</p>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        <footer className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1 || submitting}
            className="rounded-xl border border-white/10 bg-zinc-900/60 px-5 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-zinc-900 disabled:opacity-30"
            style={{ minHeight: 48 }}
          >
            Back
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canContinue || submitting}
              className="rounded-xl bg-violet-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-40"
              style={{ minHeight: 48 }}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={() => finish(voiceId, false)}
              disabled={!voiceId || submitting || !personality || !nameValid}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-6 py-3 text-sm font-semibold text-zinc-950 transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ minHeight: 48 }}
            >
              {submitting ? 'Saving…' : 'Finish'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
