'use client';

/**
 * Reference tray (Phase 8.4): up to 14 pictures, lettered A–N, each with a role and an optional lock (a locked set is
 * re-attached to every next image: character consistency). Uploads go to private storage first; only owner paths are sent.
 */
import { Lock, Unlock, X } from 'lucide-react';
import { ART_ROLES, IDENTITY_SOFT_LIMIT, MAX_REFERENCES, PERSON_ROLES, REF_LETTERS, type ArtRole } from '@/lib/image/artDirector/spec';
import { artLabel, type Lang } from '@/lib/image/artDirector/labels';

export interface TrayRef { path: string; previewUrl: string; role: ArtRole; locked: boolean; note?: string }

const ROLE_LABEL: Record<ArtRole, { ka: string; en: string; ru: string }> = {
  face: { ka: 'სახე', en: 'Face', ru: 'Лицо' },
  character: { ka: 'პერსონაჟი', en: 'Character', ru: 'Персонаж' },
  outfit: { ka: 'ტანსაცმელი', en: 'Outfit', ru: 'Одежда' },
  style: { ka: 'სტილი', en: 'Style', ru: 'Стиль' },
  pose: { ka: 'პოზა', en: 'Pose', ru: 'Поза' },
  composition: { ka: 'კომპოზიცია', en: 'Composition', ru: 'Композиция' },
  background: { ka: 'ფონი', en: 'Background', ru: 'Фон' },
  product: { ka: 'პროდუქტი', en: 'Product', ru: 'Товар' },
  color: { ka: 'ფერები', en: 'Colours', ru: 'Цвета' },
  object: { ka: 'ობიექტი', en: 'Object', ru: 'Объект' },
};

const ADD = { ka: 'სურათის დამატება', en: 'Add picture', ru: 'Добавить' } as const;

export function ReferenceTray({ refs, onChange, onAdd, lang, busy }: {
  refs: TrayRef[];
  onChange: (next: TrayRef[]) => void;
  onAdd: (files: File[]) => void;
  lang: Lang;
  busy?: boolean;
}) {
  const room = MAX_REFERENCES - refs.length;
  const people = refs.filter((r) => PERSON_ROLES.includes(r.role)).length;
  const patch = (i: number, p: Partial<TrayRef>) => onChange(refs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div data-testid="art-reference-tray" className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {refs.map((r, i) => (
          <figure key={r.path} data-testid={`art-ref-${REF_LETTERS[i]}`} className="relative w-[84px] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- private signed preview */}
            <img src={r.previewUrl} alt="" className="h-[84px] w-[84px] rounded-xl border border-app-border/20 object-cover" />
            <span className="absolute left-1 top-1 rounded-md bg-app-bg/80 px-1.5 text-[12px] font-bold text-app-text">{REF_LETTERS[i]}</span>
            <button type="button" aria-label="remove" onClick={() => onChange(refs.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-app-bg/80 p-0.5 text-app-text"><X size={12} /></button>
            <button type="button" aria-pressed={r.locked} aria-label="lock" data-testid={`art-ref-lock-${REF_LETTERS[i]}`} onClick={() => patch(i, { locked: !r.locked })}
              className={`absolute bottom-7 right-1 rounded-full p-1 ${r.locked ? 'bg-app-accent text-app-bg' : 'bg-app-bg/80 text-app-text'}`}>
              {r.locked ? <Lock size={11} /> : <Unlock size={11} />}
            </button>
            <select aria-label="role" value={r.role} data-testid={`art-ref-role-${REF_LETTERS[i]}`} onChange={(e) => patch(i, { role: e.target.value as ArtRole })}
              className="mt-1 w-full rounded-md border border-app-border/25 bg-app-elevated text-[11px] text-app-text">
              {ART_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role][lang]}</option>)}
            </select>
          </figure>
        ))}
        {room > 0 ? (
          <label data-testid="art-ref-add" className={`flex h-[84px] w-[84px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-app-border/40 text-center text-[11px] text-app-muted ${busy ? 'opacity-60' : ''}`}>
            + {ADD[lang]}<span className="tabular-nums">{refs.length}/{MAX_REFERENCES}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={busy}
              onChange={(e) => { const files = Array.from(e.target.files ?? []).slice(0, room); if (files.length) onAdd(files); e.target.value = ''; }} />
          </label>
        ) : null}
      </div>
      {people > IDENTITY_SOFT_LIMIT ? <p role="status" data-testid="art-identity-warn" className="text-[12px] text-amber-400">{artLabel('identityWarn', lang)}</p> : null}
    </div>
  );
}
