'use client';

/**
 * Presenter Card (Phase 8.6): the scene's video, its transcript lit word by word as the presenter speaks (karaoke), and
 * Regenerate scene · Change voice · Edit script · Use in Video. Word times come from the scene (Chirp, Live's transcript,
 * or estimated — then the card says so). A click on a word seeks the video there.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { activeWordAt, type WordTiming } from '@/lib/avatar/studio/timing';
import { VOICES, type Gender, type VoiceId } from '@/lib/avatar/studio/catalog';
import { t, type StudioLang } from './labels';

export interface PresenterCardScene {
  sceneIndex: number;
  url: string;
  text: string;
  timings: WordTiming[] | null;
  timingSource: 'chirp' | 'live' | 'estimated' | null;
  warnings: string[];
  durationSec: number | null;
  engine: 'live' | 'omni';
  voiceId: string | null;
}

export function KaraokeTranscript({ timings, text, time, onSeek }: { timings: WordTiming[] | null; text: string; time: number; onSeek?: (sec: number) => void }) {
  const active = timings ? activeWordAt(timings, time) : -1;
  if (!timings || timings.length === 0) return <p data-testid="vs-transcript" className="text-[14px] leading-relaxed text-app-text">{text}</p>;
  return (
    <p data-testid="vs-transcript" className="text-[14px] leading-relaxed text-app-muted">
      {timings.map((w, i) => (
        <span key={`${i}-${w.start}`}>
          <button type="button" data-testid={`vs-word-${i}`} data-active={i === active ? 'true' : 'false'}
            onClick={() => onSeek?.(w.start)}
            className={i === active ? 'rounded bg-app-accent/25 px-0.5 text-app-text' : i < active ? 'text-app-text' : 'hover:text-app-text'}>
            {w.word}
          </button>{' '}
        </span>
      ))}
    </p>
  );
}

export function PresenterCard({ scene, lang, busy, gender, onRegenerate, onChangeVoice, onEditScript, onUseInVideo }: {
  scene: PresenterCardScene;
  lang: StudioLang;
  busy?: boolean;
  /** The presenter's gender: its voices are listed first. */
  gender: Gender;
  onRegenerate: () => void;
  onChangeVoice?: (voice: VoiceId) => void;
  onEditScript: (text: string) => void;
  onUseInVideo?: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [time, setTime] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scene.text);
  const [picking, setPicking] = useState(false);
  useEffect(() => setDraft(scene.text), [scene.text]);

  // timeupdate fires ~4×/s; a frame loop keeps the lit word on the syllable while playing.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let raf = 0;
    const loop = () => { setTime(v.currentTime); raf = requestAnimationFrame(loop); };
    const play = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); setTime(v.currentTime); };
    v.addEventListener('play', play);
    v.addEventListener('pause', stop);
    v.addEventListener('seeked', stop);
    v.addEventListener('timeupdate', stop);
    return () => { cancelAnimationFrame(raf); v.removeEventListener('play', play); v.removeEventListener('pause', stop); v.removeEventListener('seeked', stop); v.removeEventListener('timeupdate', stop); };
  }, [scene.url]);

  const voices = useMemo(() => [...VOICES].sort((a, b) => Number(b.gender === gender) - Number(a.gender === gender)), [gender]);
  const seek = (sec: number) => { if (video.current) { video.current.currentTime = sec; setTime(sec); } };

  return (
    <article data-testid={`vs-card-${scene.sceneIndex}`} className="overflow-hidden rounded-2xl border border-app-border bg-app-surface">
      <video ref={video} src={scene.url} controls playsInline preload="metadata" data-testid="vs-video" className="aspect-video w-full bg-black object-contain" />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-app-muted">
          <span className="font-semibold text-app-text">{t('scene', lang)} {scene.sceneIndex + 1}</span>
          {scene.durationSec ? <span>{scene.durationSec.toFixed(1)} s</span> : null}
          {scene.voiceId ? <span>· {scene.voiceId}</span> : null}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea data-testid="vs-edit" value={draft} onChange={(e) => setDraft(e.target.value)} rows={5}
              className="w-full rounded-xl border border-app-border bg-app-bg p-3 text-[14px] text-app-text" />
            <div className="flex gap-2">
              <button type="button" data-testid="vs-edit-save" disabled={busy || !draft.trim()} onClick={() => { setEditing(false); onEditScript(draft.trim()); }}
                className="rounded-full bg-app-accent px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">{t('save', lang)}</button>
              <button type="button" onClick={() => { setEditing(false); setDraft(scene.text); }} className="rounded-full px-4 py-2 text-[13px] text-app-muted">{t('cancel', lang)}</button>
            </div>
          </div>
        ) : (
          <KaraokeTranscript timings={scene.timings} text={scene.text} time={time} onSeek={seek} />
        )}
        {scene.warnings.includes('not_verbatim') && <p data-testid="vs-warn-verbatim" className="text-[12px] text-amber-300">{t('notVerbatim', lang)}</p>}
        {(scene.timingSource === 'estimated' || scene.warnings.includes('timing_estimated')) && <p data-testid="vs-warn-timing" className="text-[12px] text-app-muted">{t('timingEstimated', lang)}</p>}
        {picking && onChangeVoice && (
          <div data-testid="vs-voices" className="flex flex-wrap gap-1.5">
            {voices.map((v) => (
              <button key={v.id} type="button" data-testid={`vs-voice-${v.id}`} disabled={busy}
                onClick={() => { setPicking(false); onChangeVoice(v.id); }}
                className={`rounded-full border px-3 py-1 text-[12px] ${v.id === scene.voiceId ? 'border-app-accent text-app-text' : 'border-app-border text-app-muted'}`}>
                {v.id} · {v.character[lang]}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="vs-regenerate" disabled={busy} onClick={onRegenerate} className="rounded-full border border-app-border px-3 py-1.5 text-[13px] text-app-text disabled:opacity-40">{t('regenerate', lang)}</button>
          {onChangeVoice && scene.engine === 'live' && (
            <button type="button" data-testid="vs-change-voice" disabled={busy} onClick={() => setPicking((p) => !p)} className="rounded-full border border-app-border px-3 py-1.5 text-[13px] text-app-text disabled:opacity-40">{t('changeVoice', lang)}</button>
          )}
          <button type="button" data-testid="vs-edit-script" disabled={busy} onClick={() => setEditing(true)} className="rounded-full border border-app-border px-3 py-1.5 text-[13px] text-app-text disabled:opacity-40">{t('editScript', lang)}</button>
          {onUseInVideo && (
            <button type="button" data-testid="vs-use-in-video" disabled={busy} onClick={onUseInVideo} className="rounded-full bg-app-accent/15 px-3 py-1.5 text-[13px] font-semibold text-app-accent disabled:opacity-40">{t('useInVideo', lang)}</button>
          )}
        </div>
      </div>
    </article>
  );
}
