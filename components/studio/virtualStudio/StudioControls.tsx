'use client';

/**
 * Virtual Studio controls: the presenter library (Studio = Live presenters, Cinematic = Omni faces; female/male,
 * professional/casual), voice (Live: the voice it speaks in; Cinematic: its own voice, or a named "Studio voice (lips
 * approximate)" dub with exact speed/pitch sliders — D3/D6), tone, pace, format, quality (Omni) and the
 * background. Every price shown is the 30 s price from lib/avatar/studio/price (the server charges the same).
 */
import { useState } from 'react';
import { filterPresenters, PACES, TONES, TONE_LABEL, VOICES, presenterById, type Gender, type PresenterLook, type StudioEngine } from '@/lib/avatar/studio/catalog';
import { price30s, type StudioBook } from '@/lib/avatar/studio/price';
import type { StudioRequest } from '@/lib/avatar/studio/plan';
import { VOICE_PITCH_MAX, VOICE_PITCH_MIN, VOICE_SPEED_MAX, VOICE_SPEED_MIN } from '@/lib/avatar/studio/voiceAdjust';
import { t, type StudioLang } from './labels';

const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13px] ${on ? 'border-app-accent bg-app-accent/15 text-app-text' : 'border-app-border text-app-muted hover:text-app-text'}`;

export function PresenterLibrary({ value, onChange, lang, book }: { value: string; onChange: (id: string) => void; lang: StudioLang; book: StudioBook }) {
  const [engine, setEngine] = useState<StudioEngine | undefined>(undefined);
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [look, setLook] = useState<PresenterLook | undefined>(undefined);
  const list = filterPresenters({ engine, gender, look });
  const toggle = <T,>(cur: T | undefined, v: T, set: (x: T | undefined) => void) => set(cur === v ? undefined : v);
  return (
    <div data-testid="vs-library" className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" data-testid="vs-f-live" className={chip(engine === 'live')} onClick={() => toggle(engine, 'live', setEngine)}>{t('live', lang)} · ✦{price30s('live', book)}/{t('per30', lang)}</button>
        <button type="button" data-testid="vs-f-omni" className={chip(engine === 'omni')} onClick={() => toggle(engine, 'omni', setEngine)}>{t('omni', lang)} · ✦{price30s('omni', book)}/{t('per30', lang)}</button>
        <button type="button" data-testid="vs-f-female" className={chip(gender === 'female')} onClick={() => toggle(gender, 'female', setGender)}>{t('female', lang)}</button>
        <button type="button" data-testid="vs-f-male" className={chip(gender === 'male')} onClick={() => toggle(gender, 'male', setGender)}>{t('male', lang)}</button>
        <button type="button" data-testid="vs-f-professional" className={chip(look === 'professional')} onClick={() => toggle(look, 'professional', setLook)}>{t('professional', lang)}</button>
        <button type="button" data-testid="vs-f-casual" className={chip(look === 'casual')} onClick={() => toggle(look, 'casual', setLook)}>{t('casual', lang)}</button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {list.map((p) => (
          <button key={p.id} type="button" data-testid={`vs-presenter-${p.id}`} aria-pressed={p.id === value} onClick={() => onChange(p.id)}
            className={`overflow-hidden rounded-xl border text-left ${p.id === value ? 'border-app-accent ring-2 ring-app-accent/40' : 'border-app-border'}`}>
            {p.thumb
              ? <img src={p.thumb} alt="" className="aspect-[3/4] w-full object-cover" />
              : <div className="flex aspect-[3/4] w-full items-center justify-center bg-gradient-to-b from-app-accent/30 to-app-bg text-[28px] font-semibold text-app-text">{p.label[lang].slice(0, 1)}</div>}
            <div className="px-2 py-1.5">
              <div className="truncate text-[12px] font-semibold text-app-text">{p.label[lang]}</div>
              <div className="text-[11px] text-app-muted">{p.engine === 'live' ? t('live', lang) : t('omni', lang)}</div>
            </div>
          </button>
        ))}
      </div>
      <p className="text-[12px] text-app-muted">{presenterById(value)?.engine === 'omni' ? t('omniNote', lang) : t('liveNote', lang)}</p>
    </div>
  );
}

export function StudioControls({ value, onChange, lang, book, onUploadBackground }: {
  value: StudioRequest;
  onChange: (r: StudioRequest) => void;
  lang: StudioLang;
  book: StudioBook;
  /** Sends a picked image to /api/avatar/studio/background; resolves the stored path. */
  onUploadBackground?: (file: File) => Promise<string | null>;
}) {
  const presenter = presenterById(value.presenterId);
  const set = (patch: Partial<StudioRequest>) => onChange({ ...value, ...patch });
  const bg = value.background ?? { kind: 'studio' as const };
  const live = presenter?.engine === 'live';
  const dub = !live && !!value.voiceId;
  return (
    <div data-testid="vs-controls" className="space-y-3">
      <PresenterLibrary value={value.presenterId} lang={lang} book={book}
        onChange={(id) => {
          const p = presenterById(id);
          // A new presenter starts with its own voice; an image background stays only for Live.
          onChange({ ...value, presenterId: id, voiceId: p?.engine === 'live' ? p.defaultVoice : null, background: p?.engine === 'omni' && bg.kind === 'upload' ? { kind: 'studio' } : bg });
        }} />
      <label className="block text-[12px] text-app-muted">{t('voice', lang)}
        {live ? (
          <select data-testid="vs-voice" value={value.voiceId ?? presenter?.defaultVoice ?? ''} onChange={(e) => set({ voiceId: e.target.value })}
            className="mt-1 block w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[14px] text-app-text">
            {VOICES.map((v) => <option key={v.id} value={v.id}>{v.id} · {v.character[lang]} · {v.gender === 'female' ? t('female', lang) : t('male', lang)}</option>)}
          </select>
        ) : (
          <select data-testid="vs-omni-voice" value={value.voiceId ?? ''} onChange={(e) => set({ voiceId: e.target.value || null })}
            className="mt-1 block w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[14px] text-app-text">
            <option value="">{t('omniVoice', lang)}</option>
            {VOICES.map((v) => <option key={v.id} value={v.id}>{v.id} · {t('dubLabel', lang)}</option>)}
          </select>
        )}
      </label>
      {dub && (
        <div data-testid="vs-dub-sliders" className="grid grid-cols-2 gap-3">
          <label className="block text-[12px] text-app-muted">{t('speed', lang)} · {(value.voiceSpeed ?? 1).toFixed(2)}×
            <input type="range" data-testid="vs-voice-speed" min={VOICE_SPEED_MIN} max={VOICE_SPEED_MAX} step={0.05} value={value.voiceSpeed ?? 1}
              onChange={(e) => set({ voiceSpeed: Number(e.target.value) })} className="mt-1 block w-full" />
          </label>
          <label className="block text-[12px] text-app-muted">{t('pitch', lang)} · {(value.voicePitch ?? 0) > 0 ? '+' : ''}{value.voicePitch ?? 0}
            <input type="range" data-testid="vs-voice-pitch" min={VOICE_PITCH_MIN} max={VOICE_PITCH_MAX} step={0.5} value={value.voicePitch ?? 0}
              onChange={(e) => set({ voicePitch: Number(e.target.value) })} className="mt-1 block w-full" />
          </label>
        </div>
      )}
      <div>
        <div className="mb-1 text-[12px] text-app-muted">{t('tone', lang)}</div>
        <div className="flex flex-wrap gap-1.5">
          {TONES.map((x) => <button key={x} type="button" data-testid={`vs-tone-${x}`} className={chip((value.tone ?? 'friendly') === x)} onClick={() => set({ tone: x })}>{TONE_LABEL[x][lang]}</button>)}
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <div className="mb-1 text-[12px] text-app-muted">{t('pace', lang)}</div>
          <div className="flex gap-1.5">{PACES.map((x) => <button key={x} type="button" data-testid={`vs-pace-${x}`} className={chip((value.pace ?? 'natural') === x)} onClick={() => set({ pace: x })}>{t(x, lang)}</button>)}</div>
        </div>
        <div>
          <div className="mb-1 text-[12px] text-app-muted">{t('format', lang)}</div>
          <div className="flex gap-1.5">{(['16:9', '9:16'] as const).map((x) => <button key={x} type="button" data-testid={`vs-format-${x}`} className={chip((value.format ?? presenter?.nativeFormat) === x)} onClick={() => set({ format: x })}>{x}</button>)}</div>
        </div>
        {!live && (
          <div>
            <div className="mb-1 text-[12px] text-app-muted">{t('quality', lang)}</div>
            <div className="flex gap-1.5">{(['720p', '1080p'] as const).map((x) => <button key={x} type="button" data-testid={`vs-res-${x}`} className={chip((value.resolution ?? '720p') === x)} onClick={() => set({ resolution: x })}>{x} · ✦{price30s('omni', book, x)}</button>)}</div>
          </div>
        )}
      </div>
      <div>
        <div className="mb-1 text-[12px] text-app-muted">{t('background', lang)}</div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" data-testid="vs-bg-studio" className={chip(bg.kind === 'studio')} onClick={() => set({ background: { kind: 'studio' } })}>{t('bgStudio', lang)}</button>
          <button type="button" data-testid="vs-bg-green" className={chip(bg.kind === 'green')} onClick={() => set({ background: { kind: 'green' } })}>{t('bgGreen', lang)}</button>
          {live && onUploadBackground && (
            <label className={`${chip(bg.kind === 'upload')} cursor-pointer`}>
              {t('bgUpload', lang)}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" data-testid="vs-bg-file"
                onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const path = await onUploadBackground(f); if (path) set({ background: { kind: 'upload', path } }); }} />
            </label>
          )}
          <button type="button" data-testid="vs-bg-generate" className={chip(bg.kind === 'generate')} onClick={() => set({ background: { kind: 'generate', prompt: bg.kind === 'generate' ? bg.prompt : '' } })}>{t('bgGenerate', lang)}</button>
        </div>
        {bg.kind === 'generate' && (
          <input data-testid="vs-bg-prompt" value={bg.prompt} maxLength={400} placeholder={t('bgDescribe', lang)} onChange={(e) => set({ background: { kind: 'generate', prompt: e.target.value } })}
            className="mt-2 block w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[14px] text-app-text" />
        )}
      </div>
    </div>
  );
}
