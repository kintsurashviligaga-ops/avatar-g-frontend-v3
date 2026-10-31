/**
 * lib/documents/client.ts — the chat's side of „make me a PDF": ask /api/documents/create, and say what came back.
 * Browser-safe (no server imports). The route's answers are read shape by shape; anything else is a failure.
 */
import type { DocumentLocale } from './spec';

export type DocumentResult =
  | { ok: true; url: string; persisted: boolean; fileName: string; title: string; pages: number; bytes: number; path?: string }
  | { ok: false; reason: 'signed_out' | 'limit' | 'not_written' | 'network'; message?: string };

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Bytes the route handed back inline (Storage refused them) → a link that lives on this device only. */
function inlineUrl(b64: string): string | null {
  try {
    if (typeof URL.createObjectURL !== 'function') return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  } catch {
    return null;
  }
}

export async function requestDocument(
  input: { prompt: string; locale: DocumentLocale; source?: string },
  opts?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<DocumentResult> {
  const f = opts?.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f('/api/documents/create', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: input.prompt, locale: input.locale, ...(input.source ? { source: input.source.slice(0, 20_000) } : {}) }),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 401) return { ok: false, reason: 'signed_out' };
  if (res.status === 429) return { ok: false, reason: 'limit' };
  if (!res.ok || !body || body.ok !== true) {
    return { ok: false, reason: 'not_written', ...(isStr(body?.message) ? { message: body!.message as string } : {}) };
  }
  const { fileName, title, pages, bytes } = body;
  if (!isStr(fileName) || !isStr(title) || !isNum(pages) || !isNum(bytes)) return { ok: false, reason: 'not_written' };
  if (isStr(body.url) && /^https:\/\//i.test(body.url)) {
    return { ok: true, url: body.url, persisted: true, fileName, title, pages, bytes, ...(isStr(body.path) ? { path: body.path } : {}) };
  }
  const local = isStr(body.data) ? inlineUrl(body.data) : null;
  return local ? { ok: true, url: local, persisted: false, fileName, title, pages, bytes } : { ok: false, reason: 'not_written' };
}

/**
 * The card's Open and Download links. A stored PDF goes through /api/documents/file, which mints a fresh link each time
 * (the create route's own link ends in 7 days); a copy on this device only is its blob: link.
 */
export function documentLinks(d: { url: string; path?: string; name: string }): { open: string; download: string } {
  if (!d.path) return { open: d.url, download: d.url };
  const q = `path=${encodeURIComponent(d.path)}`;
  return { open: `/api/documents/file?${q}`, download: `/api/documents/file?${q}&download=1&name=${encodeURIComponent(d.name)}` };
}

/** „5 გვერდი · 120 KB" — the card's facts line. */
export function documentInfo(pages: number, bytes: number, locale: DocumentLocale): string {
  const size = bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const p = locale === 'en' ? `${pages} ${pages === 1 ? 'page' : 'pages'}` : locale === 'ru' ? `${pages} стр.` : `${pages} გვერდი`;
  return `${p} · ${size}`;
}

/**
 * A link that downloads instead of opening. A cross-origin `<a download>` is ignored by browsers, so a Supabase signed
 * link asks Storage itself to send the file as an attachment (its `download` query). A local blob: link keeps `download`.
 */
export function documentDownloadUrl(url: string, fileName: string): string {
  if (!/^https:\/\/[^/]+\/storage\/v1\/object\/sign\//i.test(url)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('download', fileName);
    return u.toString();
  } catch {
    return url;
  }
}

const COPY = {
  working: { ka: 'ვწერ დოკუმენტს და ვამზადებ PDF-ს…', en: 'Writing the document and making the PDF…', ru: 'Пишу документ и готовлю PDF…' },
  done: { ka: 'მზადაა', en: 'Ready', ru: 'Готово' },
  signed_out: { ka: 'PDF-ის შესაქმნელად შედი ანგარიშზე.', en: 'Sign in to make a PDF.', ru: 'Войдите, чтобы создать PDF.' },
  limit: { ka: 'დღევანდელი PDF-ების ლიმიტი ამოიწურა. სცადე ხვალ.', en: 'Today\'s PDF limit is reached. Try again tomorrow.', ru: 'Дневной лимит PDF исчерпан. Попробуйте завтра.' },
  not_written: { ka: 'დოკუმენტის დაწერა ვერ მოხერხდა. სცადე ცოტა ხანში ან მოთხოვნა დააზუსტე.', en: 'The document could not be written. Try again shortly or make the request more specific.', ru: 'Не удалось написать документ. Попробуйте позже или уточните запрос.' },
  network: { ka: 'კავშირი გაწყდა და PDF ვერ შეიქმნა. სცადე თავიდან.', en: 'The connection dropped and the PDF was not made. Try again.', ru: 'Связь прервалась, PDF не создан. Попробуйте ещё раз.' },
  local_only: { ka: 'ეს ასლი მხოლოდ ამ მოწყობილობაზეა: ჩამოტვირთე ახლავე.', en: 'This copy is on this device only: download it now.', ru: 'Эта копия только на этом устройстве: скачайте её сейчас.' },
} as const;

export function documentText(key: keyof typeof COPY, locale: DocumentLocale): string {
  return COPY[key][locale];
}

/** The bubble's words once the PDF is made: its title, then a note when the copy is this device's only. */
export function documentReadyText(r: Extract<DocumentResult, { ok: true }>, locale: DocumentLocale): string {
  return `${documentText('done', locale)}: **${r.title}**${r.persisted ? '' : `\n\n${documentText('local_only', locale)}`}`;
}
