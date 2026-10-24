'use client';

/**
 * components/studio/SpeechTrialPanel.tsx — what the owner's listening trial measured (lib/speech/trial).
 *
 * Shown only while a `?tts=` trial is on in this tab, which only the owner's links set; for anyone else it renders
 * nothing. A small card in the corner, not in the way of a tap: the model being tried, the time from the tap to the
 * first sound, how often the read waited for its next chunk, and per chunk how long the route took for how much
 * audio. Those are the numbers the chunk sizes are tuned with (lib/speech/chunk), so the owner can send a screenshot.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { speechTrialModel, speechTrialRecorder, type SpeechTrialRead } from '@/lib/speech/trial';

type Locale = 'ka' | 'en' | 'ru';

const LABELS: Record<Locale, { title: string; first: string; waits: string; hint: string; chars: string; audio: string }> = {
  ka: { title: 'ხმის ტესტი', first: 'პირველი ხმა', waits: 'შეჩერება', hint: 'დააჭირე დინამიკს რომელიმე პასუხზე', chars: 'სიმბ.', audio: 'აუდიო' },
  en: { title: 'Voice trial', first: 'First sound', waits: 'Waits', hint: 'Tap the speaker on a reply', chars: 'chars', audio: 'audio' },
  ru: { title: 'Тест голоса', first: 'Первый звук', waits: 'Паузы', hint: 'Нажмите на динамик у ответа', chars: 'симв.', audio: 'аудио' },
};

/** At most this many chunk rows; a long reply's later chunks matter less for the start and the first waits. */
const MAX_ROWS = 8;

const seconds = (ms: number | null): string => (ms === null ? '…' : `${(ms / 1000).toFixed(1)} s`);

const noRead = () => null;

export function SpeechTrialPanel({ locale = 'ka' }: { locale?: Locale }) {
  // Read after mount: the server has no tab, and the first client render must match it.
  const [model, setModel] = useState<string | null>(null);
  useEffect(() => setModel(speechTrialModel()), []);
  const rec = speechTrialRecorder();
  const read: SpeechTrialRead | null = useSyncExternalStore(rec.subscribe, rec.snapshot, noRead);
  if (!model) return null;
  const l = LABELS[locale] ?? LABELS.ka;
  return (
    <div
      data-speech-trial={model}
      className="pointer-events-none fixed left-2 top-2 z-[80] max-w-[min(92vw,22rem)] rounded-lg bg-black/80 px-3 py-2 font-mono text-[11px] leading-4 text-white/90 shadow-lg"
    >
      <div>
        {l.title}: {read?.model ?? model}
      </div>
      {read ? (
        <>
          <div>
            {l.first}: {seconds(read.firstSoundMs)} · {l.waits}: {read.waits} ({seconds(read.waitMs)})
          </div>
          {read.chunks.slice(0, MAX_ROWS).map((c, i) => (
            <div key={i}>
              #{i + 1} {c.chars} {l.chars} → {seconds(c.synthMs)} · {l.audio} {seconds(c.audioMs)}
            </div>
          ))}
        </>
      ) : (
        <div>{l.hint}</div>
      )}
    </div>
  );
}
