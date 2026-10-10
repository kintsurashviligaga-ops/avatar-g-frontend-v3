'use client';

/**
 * AgentAnalyzeCard — Agent G's answer to „what is in my video?" (lib/agent/media/analyzeChat) as a task card: the upload
 * or the link, Gemini reading the whole file, the answer; under them the scenes as chips (time · what happens), the best
 * moments, who speaks, and the transcript folded. The answer's words are the bubble's own text above the card.
 */
import { analyzeCard, type AgentAnalyzeState } from '@/lib/agent/media/analyzeChat';
import { AgentTaskCard } from './AgentTaskCard';

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { scenes: string; moments: string; speakers: string; transcript: string; objects: string }> = {
  ka: { scenes: 'სცენები', moments: 'საუკეთესო მომენტები', speakers: 'ვინ საუბრობს', transcript: 'ტრანსკრიპტი', objects: 'კადრში' },
  en: { scenes: 'Scenes', moments: 'Best moments', speakers: 'Who speaks', transcript: 'Transcript', objects: 'In the frame' },
  ru: { scenes: 'Сцены', moments: 'Лучшие моменты', speakers: 'Кто говорит', transcript: 'Расшифровка', objects: 'В кадре' },
};

const head = 'text-[11px] font-semibold uppercase tracking-wide text-app-muted';
// The size sits on each line: the reply's prose styles size a bare <li> like body text.
const line = 'text-[12.5px] leading-snug text-app-text';

export function AgentAnalyzeCard({ state, locale }: { state: AgentAnalyzeState; locale: string }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = L[lang];
  const m = analyzeCard(state, locale);
  const any = m.scenes.length || m.moments.length || m.speakers.length || m.transcript.length || m.objects.length || m.note;

  const footer = any ? (
    <div className="space-y-3 border-t border-app-border/15 pt-2.5" data-testid="agent-analyze-details">
      {m.scenes.length ? (
        <section aria-label={t.scenes}>
          <p className={head}>{t.scenes}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" data-testid="agent-analyze-scenes">
            {m.scenes.map((s, i) => (
              <li key={i} title={s.text}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-app-border/10 px-2.5 py-1 text-[12px] text-app-text ring-1 ring-app-border/15">
                <span className="shrink-0 tabular-nums text-app-muted">{s.at}</span>
                <span className="min-w-0 truncate">{s.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {m.moments.length ? (
        <section aria-label={t.moments}>
          <p className={head}>{t.moments}</p>
          <ol className="mt-1 space-y-0.5 text-[12.5px] text-app-text" data-testid="agent-analyze-moments">
            {m.moments.map((x, i) => <li key={i} className={line}><span className="tabular-nums text-app-muted">{x.at}</span> · {x.text}</li>)}
          </ol>
        </section>
      ) : null}
      {m.speakers.length ? (
        <section aria-label={t.speakers}>
          <p className={head}>{t.speakers}</p>
          <ul className="mt-1 space-y-0.5 text-[12.5px] text-app-text">{m.speakers.map((x, i) => <li key={i} className={line}>{x}</li>)}</ul>
        </section>
      ) : null}
      {m.objects.length ? <p className="text-[12px] text-app-muted"><span className="font-semibold">{t.objects}:</span> {m.objects.join(' · ')}</p> : null}
      {m.transcript.length ? (
        <details className="text-[12.5px] text-app-text" data-testid="agent-analyze-transcript">
          <summary className="cursor-pointer select-none py-0.5 text-[12px] text-app-muted outline-none hover:text-app-text focus-visible:ring-2 focus-visible:ring-app-accent/50">
            {t.transcript} <span className="tabular-nums">({m.transcript.length})</span>
          </summary>
          <ol className="mt-1 max-h-64 space-y-1 overflow-y-auto pr-1">
            {m.transcript.map((x, i) => (
              <li key={i} className={line}><span className="tabular-nums text-app-muted">{x.at}</span>{x.who ? <span className="font-medium"> {x.who}:</span> : null} {x.text}</li>
            ))}
          </ol>
        </details>
      ) : null}
      {m.note ? <p className="text-[12px] text-app-muted" data-testid="agent-analyze-note">{m.note}</p> : null}
    </div>
  ) : null;

  return <AgentTaskCard model={m} locale={locale} testId="agent-analyze-card" phase={state.phase} footer={footer} />;
}
