'use client';
/**
 * components/chat/composer/DictationMetricsReadout.tsx — the composer mic's MEASURED latency on this device, on screen.
 *
 * Off unless the page was opened with `?micstats=1` (remembered for the tab; `?micstats=0` turns it off). It exists so
 * a phone can be measured without a desktop inspector: dictate a few times, then screenshot the line. It reads only
 * this page's own summaries (lib/voice/dictationMetrics — timings, never words) and shows p50 / p95 of what was
 * measured; a step no dictation reached shows "—", never a target. During the owner's `?stt=` model trial
 * (lib/voice/sttTrial) the line ends with that model, so a screenshot says which model it measured.
 */
import { useEffect, useState } from 'react';
import {
  DICTATION_METRICS_EVENT,
  readDictationMetrics,
  summarizeDictationLatency,
  type DictationLatency,
  type LatencyStat,
} from '@/lib/voice/dictationMetrics';
import { sttTrialModel } from '@/lib/voice/sttTrial';

export const MIC_STATS_PARAM = 'micstats';
const MIC_STATS_KEY = 'myavatar:micstats';

/** `?micstats=1` turns the readout on for this tab, `?micstats=0` off; otherwise the tab's last choice. */
export function micStatsEnabled(search: string, store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get(MIC_STATS_PARAM); } catch { /* malformed */ }
  try {
    if (q === '1') store?.setItem(MIC_STATS_KEY, '1');
    if (q === '0') store?.removeItem(MIC_STATS_KEY);
    return q === '1' || (q !== '0' && store?.getItem(MIC_STATS_KEY) === '1');
  } catch {
    return q === '1';
  }
}

const fmt = (s: LatencyStat): string => (s.n ? `${s.p50} / ${s.p95}` : '—');

export function micStatsLine(l: DictationLatency, locale?: string, trialModel?: string | null): string {
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const label = {
    ka: { head: 'მიკროფონი, ამ მოწყობილობაზე', n: 'კარნახი', tap: 'შეხება→მოსმენა', first: 'პირველი ტექსტი', fin: 'Stop→საბოლოო' },
    en: { head: 'Mic, this device', n: 'dictations', tap: 'tap→listening', first: 'first text', fin: 'Stop→final' },
    ru: { head: 'Микрофон, это устройство', n: 'диктовок', tap: 'нажатие→запись', first: 'первый текст', fin: 'Stop→итог' },
  }[lang];
  const line = `${label.head} (${l.dictations} ${label.n}, p50 / p95 ms): ${label.tap} ${fmt(l.tapToListening)} · ${label.first} ${fmt(l.listeningToFirstText)} · ${label.fin} ${fmt(l.stopToFinal)}`;
  return trialModel ? `${line} · STT ${trialModel}` : line;
}

export function DictationMetricsReadout({ locale }: { locale?: string }) {
  const [on, setOn] = useState(false);
  const [latency, setLatency] = useState<DictationLatency | null>(null);
  const [trial, setTrial] = useState<string | null>(null);

  useEffect(() => {
    let store: Storage | null = null;
    try { store = window.sessionStorage; } catch { /* blocked storage */ }
    setOn(micStatsEnabled(window.location.search, store));
    setTrial(sttTrialModel());
  }, []);

  useEffect(() => {
    if (!on) return undefined;
    const refresh = () => setLatency(summarizeDictationLatency(readDictationMetrics()));
    refresh();
    window.addEventListener(DICTATION_METRICS_EVENT, refresh);
    return () => window.removeEventListener(DICTATION_METRICS_EVENT, refresh);
  }, [on]);

  if (!on || !latency) return null;
  return (
    <div data-testid="mic-stats" aria-live="polite" className="mb-2 px-1 text-[11px] leading-snug tabular-nums text-app-muted">
      {micStatsLine(latency, locale, trial)}
    </div>
  );
}
