'use client';

/**
 * The reference slots of the dock (brief §6: "refs 0/5"), generated from the model's own media fields: a
 * first frame for image→video, a photo + a motion video for motion transfer, up to five photos or sounds for
 * reference→video. Uploads go straight to our storage (useUpload → a storage PATH); the server swaps the
 * path for a signed URL only after checking it sits under the caller's own prefix (lib/studio/media.ts).
 */
import { useRef } from 'react';
import { Film, Music2, Plus, X } from 'lucide-react';
import type { ParamSpec } from '@/lib/providers/paramSpec';
import { mediaSpecs, type MediaValues, type StudioModel } from '@/lib/studio/ui/dock';
import { FIRST_FRAME, PARAM_LABEL, T, tx, type Lang } from './copy';
import { AUDIO_ACCEPT } from '@/lib/media/accept';

const ACCEPT: Record<string, string> = { image: 'image/*', video: 'video/*', audio: AUDIO_ACCEPT };

export interface MediaSlotsProps {
  model: StudioModel;
  media: MediaValues;
  /** value (storage path or URL) → a local preview URL for images. */
  previews: Record<string, string>;
  busy: boolean;
  lang: Lang;
  onAdd: (spec: ParamSpec, files: File[]) => void;
  onRemove: (key: string, value: string) => void;
}

function labelFor(model: StudioModel, spec: ParamSpec, lang: Lang): string {
  if (spec.key === 'image_url' && model.mode === 'image-to-video') return tx(FIRST_FRAME, lang);
  return PARAM_LABEL[spec.key] ? tx(PARAM_LABEL[spec.key]!, lang) : spec.key;
}

function Thumb({ value, spec, preview, onRemove, removeLabel }: { value: string; spec: ParamSpec; preview?: string; onRemove: () => void; removeLabel: string }) {
  const src = preview || (spec.media === 'image' && /^https:\/\//.test(value) ? value : '');
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-app-border/15 bg-app-elevated">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-app-muted">
          {spec.media === 'audio' ? <Music2 size={18} /> : <Film size={18} />}
        </span>
      )}
      <button type="button" onClick={onRemove} aria-label={removeLabel}
        className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white">
        <X size={13} />
      </button>
    </div>
  );
}

export function MediaSlots({ model, media, previews, busy, lang, onAdd, onRemove }: MediaSlotsProps) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const specs = mediaSpecs(model);
  if (!specs.length) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-2" aria-label={tx(T.references, lang)}>
      {specs.map((spec) => {
        const label = labelFor(model, spec, lang);
        const values = spec.kind === 'mediaList' ? ((media[spec.key] as string[] | undefined) ?? []) : media[spec.key] ? [media[spec.key] as string] : [];
        const max = spec.kind === 'mediaList' ? spec.max ?? 5 : 1;
        const full = values.length >= max;
        return (
          <div key={spec.key} className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-app-muted">
              {label}
              {spec.required ? <span className="text-app-accent"> *</span> : null}
              {spec.kind === 'mediaList' ? <span className="tabular-nums"> {values.length}/{max}</span> : null}
            </span>
            <div className="flex gap-2">
              {values.map((v) => (
                <Thumb key={v} value={v} spec={spec} preview={previews[v]} removeLabel={`${tx(T.remove, lang)}: ${label}`} onRemove={() => onRemove(spec.key, v)} />
              ))}
              {!full && (
                <>
                  <button type="button" disabled={busy} onClick={() => inputs.current[spec.key]?.click()}
                    aria-label={`${tx(T.add, lang)}: ${label}`}
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-dashed border-app-border/25 text-app-muted transition-colors hover:border-app-accent/60 hover:text-app-accent disabled:opacity-50">
                    {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-app-muted/40 border-t-app-accent" /> : <Plus size={18} />}
                  </button>
                  <input
                    ref={(el) => { inputs.current[spec.key] = el; }}
                    type="file"
                    accept={ACCEPT[spec.media ?? 'image']}
                    multiple={spec.kind === 'mediaList'}
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []).slice(0, max - values.length);
                      e.target.value = '';
                      if (files.length) onAdd(spec, files);
                    }}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
