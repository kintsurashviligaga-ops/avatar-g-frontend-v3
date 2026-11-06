'use client';

/**
 * components/studio/SpeechTrialPanel.tsx — what the owner's listening trial measured (lib/speech/trial).
 *
 * Shown only while a `?tts=` trial is on in this tab, which only the owner's links set; for anyone else it renders
 * nothing. A small card in the corner, not in the way of a tap: the model being tried, the time from the tap to the
 * first sound, how often the read waited for its next chunk, and per chunk how long the route took for how much
 * audio, or why it sent none. Those are the numbers the chunk sizes are tuned with (lib/speech/chunk), so the owner can send a screenshot.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SpeechTimingRow } from '@/lib/speech/timing';
import { speechTrialModel, speechTrialRecorder, type SpeechTrialRead } from '@/lib/speech/trial';

type Locale = 'ka' | 'en' | 'ru';

type Labels = { title: string; first: string; waits: string; hint: string; chars: string; audio: string; server: string; network: string };

const LABELS: Record<Locale, Labels> = {
  ka: { title: 'ხმის ტესტი', first: 'პირველი ხმა', waits: 'შეჩერება', hint: 'დააჭირე დინამიკს რომელიმე პასუხზე', chars: 'სიმბ.', audio: 'აუდიო', server: 'სერვერი', network: 'ქსელი' },
  en: { title: 'Voice trial', first: 'First sound', waits: 'Waits', hint: 'Tap the speaker on a reply', chars: 'chars', audio: 'audio', server: 'server', network: 'network' },
  ru: { title: 'Тест голоса', first: 'Первый звук', waits: 'Паузы', hint: 'Нажмите на динамик у ответа', chars: 'симв.', audio: 'аудио', server: 'сервер', network: 'сеть' },
};

/** At most this many chunk rows; a long reply's later chunks matter less for the start and the first waits. */
const MAX_ROWS = 8;
/** Where the time went, under the first few rows only: the first request is the one the listener waits for. */
const TIMING_ROWS = 3;

const seconds = (ms: number | null): string => (ms === null ? '…' : `${(ms / 1000).toFixed(1)} s`);

/** "Google 3.9 s · server 0.6 s · network 0.4 s", then our slowest steps: "budget 0.3 · auth 0.2". */
function TimingLines({ t, l }: { t: SpeechTimingRow; l: Labels }) {
  return (
    <div data-speech-trial-timing className="pl-3 text-white/70">
      <div>
        Google {seconds(t.googleMs)}
        {t.attempts > 1 ? ` (${t.attempts}×)` : ''} · {l.server} {seconds(t.oursMs)} · {l.network} {seconds(t.networkMs)}
      </div>
      {t.steps.length ? <div>{t.steps.map((s) => `${s.phase} ${(s.ms / 1000).toFixed(1)}`).join(' · ')}</div> : null}
    </div>
  );
}

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
              #{i + 1} {c.chars} {l.chars} → {seconds(c.synthMs)} · {c.miss ? '✗' : `${l.audio} ${seconds(c.audioMs)}`}
              {/* Why no audio came back, so one screenshot says it (the owner's 3.8 trial read nothing, 2026-10-24). */}
              {c.miss ? <div data-speech-trial-miss className="break-words pl-3 text-red-300">{c.miss}</div> : null}
              {/* Where the ~4 s a chunk went (GG 2026-11-06): Google, our checks, or the network. */}
              {c.timing && i < TIMING_ROWS ? <TimingLines t={c.timing} l={l} /> : null}
            </div>
          ))}
        </>
      ) : (
        <div>{l.hint}</div>
      )}
    </div>
  );
}
