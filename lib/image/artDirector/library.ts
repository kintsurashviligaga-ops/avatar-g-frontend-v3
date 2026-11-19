/**
 * lib/image/artDirector/library.ts — what an Art Director image saves with (Library card + "remix this"). Pure.
 * Everything needed to understand and re-run the picture: prompt, the final prompt sent, model, style, ratio, size, seed
 * (best effort), references by letter and role, the parent image, the price and the mask digest proof.
 */
import { ART_MODEL, type ArtRatio, type ArtSize } from './spec';
import { refLetter, type ArtOperation } from './prompt';
import type { ArtRole } from './spec';

export interface ArtLibraryMeta {
  kind: 'image';
  subtype: 'art-director-v1';
  model: typeof ART_MODEL;
  operation: ArtOperation;
  prompt: string;
  finalPrompt: string;
  styleId: string | null;
  avoid: string[];
  aspectRatio: ArtRatio;
  size: ArtSize;
  seed: number | null;
  seedBestEffort: true;
  references: Array<{ letter: string; role: ArtRole; path: string; locked: boolean }>;
  parentId: string | null;
  gridId: string | null;
  gridIndex: number | null;
  credits: number;
  width: number;
  height: number;
  /** mask_edit / extend with keepRest: sha256 of the pixels outside the mask (equal to the original's). */
  unmaskedDigest: string | null;
  createdAt: string;
}

export function artLibraryMeta(x: Omit<ArtLibraryMeta, 'kind' | 'subtype' | 'model' | 'seedBestEffort' | 'references' | 'createdAt'> & {
  references: Array<{ role: ArtRole; path: string; locked?: boolean }>;
  now: Date;
}): ArtLibraryMeta {
  const { now, references, ...rest } = x;
  return {
    kind: 'image', subtype: 'art-director-v1', model: ART_MODEL, seedBestEffort: true, ...rest,
    references: references.map((r, i) => ({ letter: refLetter(i), role: r.role, path: r.path, locked: !!r.locked })),
    createdAt: now.toISOString(),
  };
}

/** Download file name: myavatar-<id>-<size>.<ext>. */
export function downloadName(id: string, size: ArtSize, format: 'png' | 'jpg'): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'image';
  return `myavatar-${safe}-${size.toLowerCase()}.${format}`;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * The result id when `path` is exactly one of THIS user's Art Director pictures (`art-director/<uid>/<uuid>.png`), else
 * null. The download and recipe routes read nothing else: an upload, another user's folder, a `..` or the JSON
 * sidecar itself are all refused here.
 */
export function artResultId(path: unknown, userId: string | null | undefined): string | null {
  if (typeof path !== 'string' || !userId || !new RegExp(`^${UUID}$`, 'i').test(userId)) return null;
  const m = new RegExp(`^art-director/${userId}/(${UUID})\\.png$`, 'i').exec(path);
  return m ? m[1]!.toLowerCase() : null;
}

/** A stored sidecar is an Art Director recipe only when it says so and carries the fields the card shows. */
export function isArtLibraryMeta(x: unknown): x is ArtLibraryMeta {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  return m.subtype === 'art-director-v1' && typeof m.prompt === 'string' && typeof m.size === 'string'
    && typeof m.aspectRatio === 'string' && Array.isArray(m.references) && Array.isArray(m.avoid);
}

type RecipeLang = 'ka' | 'en' | 'ru';
const RL = {
  prompt: { ka: 'აღწერა', en: 'Prompt', ru: 'Запрос' },
  model: { ka: 'მოდელი', en: 'Model', ru: 'Модель' },
  style: { ka: 'სტილი', en: 'Style', ru: 'Стиль' },
  frame: { ka: 'კადრი', en: 'Frame', ru: 'Кадр' },
  seed: { ka: 'Seed', en: 'Seed', ru: 'Seed' },
  avoid: { ka: 'გამორიცხე', en: 'Avoid', ru: 'Исключить' },
  refs: { ka: 'რეფერენსები', en: 'References', ru: 'Референсы' },
  op: { ka: 'მოქმედება', en: 'Action', ru: 'Действие' },
  price: { ka: 'ფასი', en: 'Price', ru: 'Цена' },
  kept: { ka: 'დანარჩენი უცვლელია', en: 'Rest kept identical', ru: 'Остальное без изменений' },
  bestEffort: { ka: '(დაახლოებით)', en: '(best effort)', ru: '(приблизительно)' },
} as const;

/** The Library recipe card's rows, in reading order. Pure. */
export function recipeRows(m: ArtLibraryMeta, lang: RecipeLang): Array<{ key: string; label: string; value: string }> {
  const rows: Array<{ key: string; label: string; value: string }> = [
    { key: 'prompt', label: RL.prompt[lang], value: m.prompt || '—' },
    { key: 'op', label: RL.op[lang], value: m.operation },
    { key: 'model', label: RL.model[lang], value: m.model },
    { key: 'frame', label: RL.frame[lang], value: `${m.aspectRatio} · ${m.size} · ${m.width}×${m.height}` },
  ];
  if (m.styleId) rows.push({ key: 'style', label: RL.style[lang], value: m.styleId });
  if (m.avoid.length) rows.push({ key: 'avoid', label: RL.avoid[lang], value: m.avoid.join('; ') });
  if (m.references.length) rows.push({ key: 'refs', label: RL.refs[lang], value: m.references.map((r) => `${r.letter} ${r.role}${r.locked ? ' 🔒' : ''}`).join(', ') });
  rows.push({ key: 'seed', label: RL.seed[lang], value: m.seed == null ? '—' : `${m.seed} ${RL.bestEffort[lang]}` });
  rows.push({ key: 'price', label: RL.price[lang], value: `✦${m.credits}` });
  if (m.unmaskedDigest) rows.push({ key: 'kept', label: RL.kept[lang], value: `sha256 ${m.unmaskedDigest.slice(0, 12)}…` });
  return rows;
}
