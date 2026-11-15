'use client';

/**
 * components/studio/montage/smart/SmartPanel.tsx — the Smart Editor's AI panel (Phase 8.7 PR B). Shown only when
 * NEXT_PUBLIC_MONTAGE_SMART_EDITOR says so; the server's MONTAGE_SMART_EDITOR still decides per user (404 otherwise).
 *
 *   Template     six starting looks (format, transition, caption look)
 *   Captions     Chirp 3 words, five styles; the price is quoted BEFORE the tap (✦2 per started minute, GG D1)
 *   Pauses       free: find the pauses (and filler words once captions exist), preview "14 pauses · −0:11", apply
 *   Beat         free: cut the clips to the music's beat
 *   Text/effects at the playhead: a title, glitch / zoom punch / shake / flash, glitch on every cut
 *
 * Every change goes through the editor's own undo (onEdit) or the smart state (onSmart); nothing here renders video.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Subtitles as Captions, Loader2, Music2, Scissors, Sparkles, Type, Wand2, Zap } from 'lucide-react';
import { CAPTION_STYLE_IDS, type CaptionLang, type CaptionPos, type CaptionStyleId } from '@/lib/services/montage/smart/captions';
import { captionCredits } from '@/lib/services/montage/smart/price';
import { syncClipsToBeat } from '@/lib/services/montage/smart/beat';
import type { SilencePlan, Sensitivity } from '@/lib/services/montage/smart/silence';
import { TEMPLATE_IDS, TEMPLATES, type TemplateId } from '@/lib/services/montage/smart/templates';
import { addEffect, addText, type FxKind, type TextLook } from '@/lib/services/montage/smart/timeline';
import { PanelShell } from '../panels';
import { langOf } from '../copy';
import { newId, totalSec as editTotal, type Edit, type MediaSource } from '../project';
import { applyBeat, applySilence, applyTemplate, captionSeconds, captionSources, glitchEveryCut, type SmartState } from './smartEdit';
import { SMART_COPY, STYLE_LABEL, FX_LABEL, type SmartCopyKey } from './smartCopy';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export interface SmartPanelProps {
  locale: string;
  edit: Edit;
  sources: Record<string, MediaSource>;
  smart: SmartState;
  playheadSec: number;
  onEdit: (fn: (e: Edit) => Edit) => void;
  onSmart: (next: SmartState) => void;
  onDone: () => void;
  /** Injected for tests; the browser's fetch otherwise. */
  fetcher?: typeof fetch;
}

type Busy = null | 'quote' | 'captions' | 'pauses' | 'beat';

async function postJson(f: typeof fetch, url: string, body: unknown): Promise<{ ok: boolean; status: number; j: Record<string, unknown> | null }> {
  try {
    const res = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, j: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return { ok: false, status: 0, j: null };
  }
}

function Section({ icon, title, children, testId }: { icon: React.ReactNode; title: string; children: React.ReactNode; testId: string }) {
  return (
    <section className="mt-4 first:mt-0" data-testid={testId}>
      <h4 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-app-text">{icon}{title}</h4>
      {children}
    </section>
  );
}

function Pill({ active, onClick, children, testId, disabled }: { active?: boolean; onClick: () => void; children: React.ReactNode; testId?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      data-testid={testId}
      className={cx('min-h-[40px] shrink-0 rounded-xl px-3 text-[12.5px] ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-40',
        active ? 'bg-app-accent/15 text-app-text ring-app-accent/50' : 'bg-app-elevated text-app-muted ring-app-border/15 hover:text-app-text')}
    >
      {children}
    </button>
  );
}

function Primary({ onClick, children, testId, disabled, busy }: { onClick: () => void; children: React.ReactNode; testId: string; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      data-testid={testId}
      className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-app-accent px-4 text-[13px] font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-40"
    >
      {busy && <Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
      {children}
    </button>
  );
}

export function SmartPanel(p: SmartPanelProps) {
  const l = langOf(p.locale);
  const t = useCallback((k: SmartCopyKey, vars: Record<string, string | number> = {}) => {
    let s = SMART_COPY[k][l];
    for (const [key, v] of Object.entries(vars)) s = s.replace(`{${key}}`, String(v));
    return s;
  }, [l]);
  const f = p.fetcher ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const [busy, setBusy] = useState<Busy>(null);
  const [note, setNote] = useState<string | null>(null);
  const [lang, setLang] = useState<CaptionLang>(p.smart.captions?.lang ?? (l === 'ka' ? 'ka' : l === 'ru' ? 'ru' : 'en'));
  const [style, setStyle] = useState<CaptionStyleId>(p.smart.captions?.style ?? 'bold-word');
  const [pos, setPos] = useState<CaptionPos>(p.smart.captions?.pos ?? 'bottom');
  const [sensitivity, setSensitivity] = useState<Sensitivity>('normal');
  const [fillers, setFillers] = useState(true);
  const [pausePlans, setPausePlans] = useState<Array<{ clipId: string; plan: SilencePlan }> | null>(null);
  const [text, setText] = useState('');
  const [look, setLook] = useState<TextLook>('title');

  const total = editTotal(p.edit.clips);
  const reqs = useMemo(() => captionSources(p.edit, p.sources), [p.edit, p.sources]);
  const speechSec = captionSeconds(reqs);
  const price = reqs.length ? captionCredits(speechSec) : 0;
  const music = p.edit.musicId ? p.sources[p.edit.musicId] : undefined;

  // A changed caption look applies at once to words already recognised (free: nothing is re-read).
  useEffect(() => {
    if (p.smart.captions && (p.smart.captions.style !== style || p.smart.captions.pos !== pos)) p.onSmart({ ...p.smart, captions: { ...p.smart.captions, style, pos } });
  }, [style, pos]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (status: number, j: Record<string, unknown> | null) => {
    if (status === 402) return t('noCredits', { n: Number(j?.credits ?? price) });
    if (status === 404) return t('notOpen');
    if (status === 401) return t('signIn');
    return t('failed');
  };

  const runCaptions = async () => {
    if (!reqs.length || busy) return;
    setBusy('captions'); setNote(null);
    const r = await postJson(f, '/api/v2/montage/smart/captions', { lang, sources: reqs });
    setBusy(null);
    if (!r.ok || !r.j?.wordsBySource) return setNote(fail(r.status, r.j));
    p.onSmart({ ...p.smart, captions: { lang, style, pos, wordsBySource: r.j.wordsBySource as Record<string, never[]> } });
    setNote(t(r.j.partial ? 'captionsPartial' : 'captionsDone', { n: Number(r.j.charged ?? 0) }));
  };

  const findPauses = async () => {
    if (busy) return;
    setBusy('pauses'); setNote(null); setPausePlans(null);
    const out: Array<{ clipId: string; plan: SilencePlan }> = [];
    for (const c of p.edit.clips) {
      const s = p.sources[c.sourceId];
      if (!s || s.kind !== 'video' || s.status !== 'ready' || !s.ref) continue;
      const words = fillers ? p.smart.captions?.wordsBySource[s.id] : undefined;
      const r = await postJson(f, '/api/v2/montage/smart/silence', {
        ...(/^https?:/i.test(s.ref) ? { url: s.ref } : { path: s.ref }),
        startSec: c.startSec, endSec: c.endSec, sensitivity,
        ...(words?.length ? { words, lang: p.smart.captions!.lang } : {}),
      });
      if (!r.ok) { setBusy(null); return setNote(fail(r.status, r.j)); }
      const plan = (r.j?.plan ?? null) as SilencePlan | null;
      if (plan && !plan.untouched) out.push({ clipId: c.id, plan });
    }
    setBusy(null);
    setPausePlans(out);
    if (!out.length) setNote(t('noPauses'));
  };

  const applyPauses = () => {
    if (!pausePlans?.length) return;
    let tooMany = false;
    p.onEdit((e) => {
      let cur = e;
      for (const { clipId, plan } of pausePlans) {
        const r = applySilence(cur, clipId, plan, () => newId('clip'));
        if (r.ok) cur = r.value; else if (r.reason === 'too_many_pieces') tooMany = true;
      }
      return cur;
    });
    setPausePlans(null);
    setNote(tooMany ? t('tooManyPieces') : t('pausesDone'));
  };

  const cutToBeat = async () => {
    if (!music?.ref || music.status !== 'ready' || busy) return;
    setBusy('beat'); setNote(null);
    const r = await postJson(f, '/api/v2/montage/smart/beat', /^https?:/i.test(music.ref) ? { url: music.ref } : { path: music.ref });
    setBusy(null);
    if (!r.ok) return setNote(fail(r.status, r.j));
    const grid = (r.j?.grid ?? null) as SmartState['grid'];
    const res = syncClipsToBeat({
      clips: p.edit.clips.map((c) => {
        const s = p.sources[c.sourceId];
        return { id: c.id, sourceId: c.sourceId, kind: s?.kind === 'image' ? 'image' : 'video', sourceSec: s?.durationSec && s.durationSec > 0 ? s.durationSec : c.endSec };
      }),
      musicSec: Number(r.j?.durationSec ?? music.durationSec),
      grid,
      musicFromSec: p.edit.musicStartSec,
      idOf: () => newId('clip'),
    });
    if (!res.ok) return setNote(res.error);
    p.onEdit((e) => applyBeat(e, res.clips, res.musicStartSec));
    p.onSmart({ ...p.smart, grid });
    setNote(res.beatSynced ? t('beatDone', { bpm: Math.round(res.bpm ?? 0) }) : t('noBeat'));
  };

  const pickTemplate = (id: TemplateId) => {
    const r = applyTemplate(p.edit, p.smart, id);
    p.onEdit((e) => ({ ...e, aspect: r.edit.aspect, clips: e.clips.map((c) => ({ ...c, transition: r.edit.clips.find((x) => x.id === c.id)?.transition ?? c.transition })) }));
    p.onSmart(r.state);
    setStyle(TEMPLATES[id].captionStyle);
    setPos(TEMPLATES[id].captionPos);
  };

  const at = Math.min(Math.max(0, p.playheadSec), Math.max(0, total - 0.2));
  const placeText = () => {
    if (!text.trim()) return;
    p.onSmart({ ...p.smart, tracks: addText(p.smart.tracks, { t0: at, t1: Math.min(total, at + 2.5), text, pos: look === 'title' ? 'top' : 'bottom', look }, total, newId('tx')) });
    setText('');
  };
  const placeFx = (kind: FxKind) => {
    const len = kind === 'shake' ? 1 : kind === 'zoomPunch' ? 0.5 : 0.3;
    p.onSmart({ ...p.smart, tracks: addEffect(p.smart.tracks, { t0: at, t1: Math.min(total, at + len), kind }, total, newId('fx')) });
  };

  const removed = pausePlans?.reduce((s, x) => s + x.plan.removedSec, 0) ?? 0;
  const count = pausePlans?.reduce((s, x) => s + x.plan.count, 0) ?? 0;

  return (
    <PanelShell title={t('title')} onDone={p.onDone} doneLabel={t('done')} testId="montage-panel-smart">
      {note && <p role="status" className="mb-3 rounded-lg bg-app-elevated px-3 py-2 text-[12px] text-app-text" data-testid="smart-note">{note}</p>}

      <Section icon={<Sparkles size={14} aria-hidden="true" />} title={t('template')} testId="smart-templates">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {TEMPLATE_IDS.map((id) => (
            <Pill key={id} active={p.smart.template === id} onClick={() => pickTemplate(id)} testId={`smart-template-${id}`}>
              {TEMPLATES[id].name[l]}
            </Pill>
          ))}
        </div>
      </Section>

      <Section icon={<Captions size={14} aria-hidden="true" />} title={t('captions')} testId="smart-captions">
        <div className="flex flex-wrap gap-2">
          {(['ka', 'en', 'ru'] as const).map((x) => <Pill key={x} active={lang === x} onClick={() => setLang(x)} testId={`smart-lang-${x}`}>{t(`lang_${x}`)}</Pill>)}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="radiogroup" aria-label={t('style')}>
          {CAPTION_STYLE_IDS.map((id) => <Pill key={id} active={style === id} onClick={() => setStyle(id)} testId={`smart-style-${id}`}>{STYLE_LABEL[id][l]}</Pill>)}
        </div>
        <div className="mt-2 flex gap-2">
          {(['top', 'middle', 'bottom'] as const).map((x) => <Pill key={x} active={pos === x} onClick={() => setPos(x)} testId={`smart-pos-${x}`}>{t(`pos_${x}`)}</Pill>)}
        </div>
        {lang === 'ka' && <p className="mt-2 text-[11.5px] text-app-muted">{t('kaPreview')}</p>}
        <Primary onClick={() => void runCaptions()} testId="smart-captions-run" disabled={!reqs.length} busy={busy === 'captions'}>
          {reqs.length ? t('captionsRun', { n: price, len: fmt(speechSec) }) : t('captionsNoSpeech')}
        </Primary>
        {p.smart.captions && <p className="mt-1.5 text-[11.5px] text-app-muted" data-testid="smart-captions-have">{t('captionsHave')}</p>}
      </Section>

      <Section icon={<Scissors size={14} aria-hidden="true" />} title={t('pauses')} testId="smart-pauses">
        <div className="flex gap-2">
          {(['low', 'normal', 'tight'] as const).map((x) => <Pill key={x} active={sensitivity === x} onClick={() => { setSensitivity(x); setPausePlans(null); }} testId={`smart-sens-${x}`}>{t(`sens_${x}`)}</Pill>)}
        </div>
        <label className="mt-2 flex min-h-[40px] items-center gap-2 text-[12.5px] text-app-text">
          <input type="checkbox" checked={fillers} onChange={(e) => setFillers(e.target.checked)} data-testid="smart-fillers" className="h-4 w-4 accent-[var(--app-accent,#7c5cff)]" />
          {t('fillers')}
        </label>
        {fillers && !p.smart.captions && <p className="text-[11.5px] text-app-muted">{t('fillersNeedCaptions')}</p>}
        {pausePlans?.length ? (
          <div className="mt-2" data-testid="smart-pauses-preview">
            <p className="text-[12.5px] text-app-text">{t('pausesFound', { n: count, sec: fmt(removed) })}</p>
            <Primary onClick={applyPauses} testId="smart-pauses-apply">{t('pausesApply')}</Primary>
          </div>
        ) : (
          <Primary onClick={() => void findPauses()} testId="smart-pauses-find" disabled={!p.edit.clips.length} busy={busy === 'pauses'}>{t('pausesFind')}</Primary>
        )}
      </Section>

      <Section icon={<Music2 size={14} aria-hidden="true" />} title={t('beat')} testId="smart-beat">
        <Primary onClick={() => void cutToBeat()} testId="smart-beat-run" disabled={!music || music.status !== 'ready' || !p.edit.clips.length} busy={busy === 'beat'}>
          {music ? t('beatRun') : t('beatNeedsMusic')}
        </Primary>
      </Section>

      <Section icon={<Type size={14} aria-hidden="true" />} title={t('textAt', { t: fmt(at) })} testId="smart-text">
        <div className="flex gap-2">
          {(['title', 'subtitle', 'label'] as const).map((x) => <Pill key={x} active={look === x} onClick={() => setLook(x)} testId={`smart-look-${x}`}>{t(`look_${x}`)}</Pill>)}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 120))}
            onKeyDown={(e) => { if (e.key === 'Enter') placeText(); }}
            placeholder={t('textPlaceholder')}
            aria-label={t('textPlaceholder')}
            data-testid="smart-text-input"
            className="min-h-[44px] min-w-0 flex-1 rounded-xl bg-app-elevated px-3 text-[13px] text-app-text ring-1 ring-app-border/15 focus:outline-none focus:ring-2 focus:ring-app-accent/60"
          />
          <Pill onClick={placeText} disabled={!text.trim() || !total} testId="smart-text-add">{t('add')}</Pill>
        </div>
      </Section>

      <Section icon={<Zap size={14} aria-hidden="true" />} title={t('effectsAt', { t: fmt(at) })} testId="smart-effects">
        <div className="flex flex-wrap gap-2">
          {(['glitch', 'zoomPunch', 'shake', 'flash'] as const).map((k) => (
            <Pill key={k} onClick={() => placeFx(k)} disabled={!total} testId={`smart-fx-${k}`}>{FX_LABEL[k][l]}</Pill>
          ))}
          <Pill onClick={() => p.onSmart({ ...p.smart, tracks: glitchEveryCut(p.smart, p.edit) })} disabled={p.edit.clips.length < 2} testId="smart-fx-glitch-cuts">
            <span className="inline-flex items-center gap-1"><Wand2 size={13} aria-hidden="true" />{t('glitchCuts')}</span>
          </Pill>
        </div>
        <p className="mt-2 text-[11.5px] text-app-muted">{t('tracksHint')}</p>
      </Section>
    </PanelShell>
  );
}
