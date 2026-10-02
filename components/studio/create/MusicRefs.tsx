'use client';

/**
 * "+ Audio | + Voice" — the two-part pill under the title row (ref2), and what hangs off it.
 *
 * Both halves feed ONE slot: the attached audio the music route can use, in one of two ways it really does:
 *   · "+ Audio" → a COVER: MusicGen's melody model re-imagines the track as an instrumental (`audioReference`, flat 30 s).
 *   · "+ Voice" → a SAMPLE of the user's voice that MiniMax sings the lyrics in (`voiceReference`) — or, when a voice
 *     model was trained, that trained voice (`useMyVoice`, the RVC path). A sheet offers record · upload · trained.
 * Which one an attached file is, is the `audioMode` switch on its chip. The file itself rides OmniStudio's attachments (the
 * runMusicJob path that re-hosts it and sends the path), so nothing here uploads anything.
 *
 * LOCKED means locked: when this deployment has no provider for a path (the status route's `references`), its half is
 * `aria-disabled`, says "not available right now" and has no handler. A button never promises what the server will refuse.
 */
import { useEffect, useRef } from 'react';
import { Mic, Music2, Square, Upload, X } from 'lucide-react';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import { musicCreateCopy } from './musicCreateCopy';
import { cx } from './primitives';

export type RefKind = 'cover' | 'voice';

export interface MusicRefsProps {
  locale: string;
  /** The attached audio, or null. `name` is absent for a recording. */
  audio: { name: string | null } | null;
  audioMode: RefKind;
  onAudioMode: (m: RefKind) => void;
  /** null = the status route has not answered: the halves are offered, and the server stays the judge. */
  available: { cover: boolean | null; voice: boolean | null };
  onPick: (kind: RefKind) => void;
  onClear: () => void;
  recording: { active: boolean; sec: number; start: () => void; stop: () => void };
  trained: { available: boolean; on: boolean; onChange: (v: boolean) => void };
  /** Instrumental tracks are not sung, so the voice paths do not apply. */
  instrumental: boolean;
  voiceSheetOpen: boolean;
  onVoiceSheet: (open: boolean) => void;
  /** false = Simple mode: no two-part pill, but an attached file (or the trained voice) still shows its chip. */
  showPill?: boolean;
}

export function MusicRefs(p: MusicRefsProps) {
  const cc = musicCreateCopy(p.locale);
  const coverLocked = p.available.cover === false;
  // A trained voice is its own path (RVC), so "+ Voice" stays open for it even when the sample path is off.
  const voiceLocked = p.available.voice === false && !p.trained.available;

  // A sample that arrives (recorded or uploaded) ends the sheet's job.
  const { audio, voiceSheetOpen, onVoiceSheet } = p;
  const hadAudio = useRef(!!audio);
  useEffect(() => {
    if (audio && !hadAudio.current && voiceSheetOpen) onVoiceSheet(false);
    hadAudio.current = !!audio;
  }, [audio, voiceSheetOpen, onVoiceSheet]);

  const half = (
    kind: RefKind,
    label: string,
    locked: boolean,
    onClick: () => void,
    active: boolean,
  ) => (
    <button
      type="button"
      data-testid={kind === 'cover' ? 'music-add-audio' : 'music-add-voice'}
      data-locked={locked ? 'true' : undefined}
      aria-disabled={locked || undefined}
      aria-haspopup={kind === 'voice' ? 'dialog' : undefined}
      title={locked ? cc.unavailable : undefined}
      onClick={locked ? undefined : onClick}
      className={cx(
        'flex min-h-[56px] min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0 px-2 text-[16px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent/60',
        active ? 'text-app-accent' : 'text-app-text/80 hover:text-app-text',
        locked && 'cursor-not-allowed opacity-55 hover:text-app-text/80',
      )}
    >
      <span className="max-w-full truncate">{label}</span>
      {locked && <span className="max-w-full truncate text-[10.5px] font-normal leading-tight text-app-muted">{cc.unavailable}</span>}
    </button>
  );

  const note = p.audio ? (p.audioMode === 'cover' ? cc.refCoverNote : cc.refVoiceNote) : null;
  const trainedOn = p.trained.available && p.trained.on && !p.instrumental;

  return (
    <div data-testid="music-refs" className="space-y-2">
      {/* A half the server would refuse right now is NOT DRAWN (it used to sit there greyed out, saying „not available right
          now" — two dead buttons at the top of the screen when both paths were off). Both off → no row at all. */}
      {p.showPill !== false && !(coverLocked && voiceLocked) && (
        <div className="flex items-stretch overflow-hidden rounded-[22px] bg-app-elevated/45 ring-1 ring-app-border/10">
          {!coverLocked && half('cover', cc.addAudio, false, () => p.onPick('cover'), !!p.audio && p.audioMode === 'cover')}
          {!coverLocked && !voiceLocked && <span aria-hidden="true" className="my-3 w-px shrink-0 bg-app-border/15" />}
          {!voiceLocked && half('voice', cc.addVoice, false, () => p.onVoiceSheet(true), (!!p.audio && p.audioMode === 'voice') || trainedOn)}
        </div>
      )}

      {p.audio && (
        <div data-testid="music-ref-chip" className="min-w-0 space-y-1.5 rounded-2xl bg-app-elevated/35 px-3 py-2 ring-1 ring-app-border/10">
          <div className="flex min-w-0 items-center gap-2">
            <Music2 size={16} aria-hidden="true" className="shrink-0 text-app-accent" />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-app-text">{p.audio.name || cc.audioPicked}</span>
            <button
              type="button"
              data-testid="music-ref-remove"
              onClick={p.onClear}
              aria-label={cc.refRemove}
              title={cc.refRemove}
              className="-mr-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div role="radiogroup" aria-label={cc.refSwitch} className="flex gap-1.5">
            {(['cover', 'voice'] as const).map((k) => {
              const on = p.audioMode === k;
              const off = (k === 'cover' ? coverLocked : p.available.voice === false) || (k === 'voice' && p.instrumental);
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-disabled={off || undefined}
                  data-testid={`music-ref-mode-${k}`}
                  onClick={off ? undefined : () => p.onAudioMode(k)}
                  className={cx(
                    'min-h-[44px] min-w-0 flex-1 rounded-xl px-2 text-[13px] font-medium ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60',
                    on ? 'bg-app-accent/15 text-app-accent ring-app-accent/40' : 'bg-app-bg/40 text-app-text/80 ring-app-border/15 hover:text-app-text',
                    off && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <span className="block truncate">{k === 'cover' ? cc.refCover : cc.refVoice}</span>
                </button>
              );
            })}
          </div>
          {note && <p data-testid="music-ref-note" className="text-[11.5px] leading-snug text-app-muted">{note}</p>}
        </div>
      )}

      {trainedOn && (
        <div data-testid="music-trained-chip" className="flex min-w-0 items-center gap-2 rounded-2xl bg-app-accent/10 px-3 py-1 ring-1 ring-app-accent/25">
          <Mic size={15} aria-hidden="true" className="shrink-0 text-app-accent" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-app-accent">{cc.refTrained}</span>
          <button
            type="button"
            onClick={() => p.trained.onChange(false)}
            aria-label={cc.refRemove}
            title={cc.refRemove}
            className="-mr-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-accent transition-colors hover:bg-app-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <BottomSheet open={p.voiceSheetOpen} onClose={() => p.onVoiceSheet(false)} title={cc.voiceTitle} closeLabel={cc.close} testId="music-voice-sheet">
        <div className="space-y-2 px-2 pb-3 pt-1">
          <p className="text-[12.5px] leading-snug text-app-muted">{cc.voiceHint}</p>
          {p.available.voice !== false && (
            <>
              {p.recording.active ? (
                <button
                  type="button"
                  data-testid="music-voice-stop"
                  onClick={p.recording.stop}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl bg-app-danger/10 px-4 text-left text-[14px] font-medium text-app-danger ring-1 ring-app-danger/30"
                >
                  <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-app-danger" />
                  <span className="min-w-0 flex-1">{p.recording.sec}{cc.secondsShort} · {cc.voiceStop}{p.recording.sec < 15 ? ` (${cc.voiceNeed15})` : ''}</span>
                  <Square size={16} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="music-voice-record"
                  onClick={p.recording.start}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl bg-app-elevated/60 px-4 text-left text-[14px] font-medium text-app-text ring-1 ring-app-border/15 hover:bg-app-elevated"
                >
                  <Mic size={18} aria-hidden="true" className="shrink-0 text-app-accent" />
                  <span className="min-w-0 flex-1">{cc.voiceRecord} <span className="font-normal text-app-muted">({cc.voiceNeed15})</span></span>
                </button>
              )}
              <button
                type="button"
                data-testid="music-voice-upload"
                onClick={() => p.onPick('voice')}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl bg-app-elevated/60 px-4 text-left text-[14px] font-medium text-app-text ring-1 ring-app-border/15 hover:bg-app-elevated"
              >
                <Upload size={18} aria-hidden="true" className="shrink-0 text-app-accent" />
                <span className="min-w-0 flex-1">{cc.voiceUpload} <span className="font-normal text-app-muted">({cc.voiceNeed15})</span></span>
              </button>
            </>
          )}
          {p.trained.available && (
            <button
              type="button"
              role="switch"
              aria-checked={p.trained.on && !p.instrumental}
              aria-disabled={p.instrumental || undefined}
              data-testid="music-voice-trained"
              onClick={p.instrumental ? undefined : () => p.trained.onChange(!p.trained.on)}
              className={cx(
                'flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-4 text-left ring-1 transition-colors',
                p.trained.on && !p.instrumental ? 'bg-app-accent/12 ring-app-accent/35' : 'bg-app-elevated/60 ring-app-border/15 hover:bg-app-elevated',
                p.instrumental && 'cursor-not-allowed opacity-55',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-app-text">{cc.voiceTrained}</span>
                <span className="block text-[12px] leading-snug text-app-muted">{p.instrumental ? cc.vocalOff : cc.voiceTrainedHint}</span>
              </span>
              <span aria-hidden="true" className={cx('flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors', p.trained.on && !p.instrumental ? 'justify-end bg-app-accent' : 'justify-start bg-app-border/25')}>
                <span className="h-5 w-5 rounded-full bg-app-text shadow" />
              </span>
            </button>
          )}
          {p.available.voice === false && !p.trained.available && (
            <p className="rounded-xl bg-app-warning/10 px-3 py-2 text-[12.5px] text-app-warning">{cc.unavailable}</p>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
