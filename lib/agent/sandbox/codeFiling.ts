/**
 * lib/agent/sandbox/codeFiling.ts — a finished chat code run, filed in the Library as a PDF (Master Task v2.0, Phase 3:
 * "result in the chat and the Library").
 *
 * The run's code and output become a DocumentSpec (lib/documents/spec) and are drawn by the same renderer as Agent G's
 * PDFs (lib/documents/pdf), then stored and filed as a 'document' row exactly like app/api/documents/create does. So it
 * lands on the Library's Docs tab, survives a refresh, and needs no migration (the 'document' kind exists since 20261031a).
 *
 * Fail-soft: the run already happened and is shown in the chat; a refused upload or write only means `filed: false`.
 * Every effect is injected, so the shape is tested offline.
 */
import { documentSpecSchema, type DocumentLocale, type DocumentSpec } from '@/lib/documents/spec';
import type { SandboxLanguage } from './policy';

/** One paragraph block holds at most 4000 characters (spec.ts); longer text is split on line ends where it can. */
const PARA_MAX = 3900;
/** What is filed of the code and of each output stream; the rest is noted as cut. */
const FILED_MAX = 24_000;

const T: Record<DocumentLocale, { title: string; code: string; out: string; err: string; none: string; exit: string; cut: string }> = {
  ka: { title: '{lang} კოდის შედეგი', code: 'კოდი', out: 'შედეგი', err: 'შეცდომები (stderr)', none: 'პროგრამამ არაფერი დაბეჭდა.', exit: 'დასრულდა, კოდი {code} · {sec} წმ', cut: '…[შემოკლებულია]' },
  en: { title: '{lang} code result', code: 'Code', out: 'Output', err: 'Errors (stderr)', none: 'The program printed nothing.', exit: 'Finished, exit code {code} · {sec} s', cut: '…[cut]' },
  ru: { title: 'Результат кода {lang}', code: 'Код', out: 'Вывод', err: 'Ошибки (stderr)', none: 'Программа ничего не вывела.', exit: 'Готово, код выхода {code} · {sec} с', cut: '…[сокращено]' },
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));

/** Splits text into paragraph-sized pieces, preferring line ends; empty text gives none. */
export function chunkText(text: string, max = PARA_MAX): string[] {
  const out: string[] = [];
  let rest = text.replace(/\s+$/, '');
  while (rest.length > max) {
    const nl = rest.lastIndexOf('\n', max);
    const at = nl > max / 2 ? nl : max;
    out.push(rest.slice(0, at));
    rest = rest.slice(at).replace(/^\n/, '');
  }
  if (rest.trim()) out.push(rest);
  return out;
}

const blocks = (text: string, cut: string) => {
  const kept = text.length > FILED_MAX ? `${text.slice(0, FILED_MAX)}\n${cut}` : text;
  return chunkText(kept).map((t) => ({ type: 'paragraph' as const, text: t }));
};

export interface FiledRun {
  language: SandboxLanguage;
  code: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  wallMs: number;
}

/** The PDF's content. Pure. Returns null only when the spec checker refuses it (it should not). */
export function codeRunSpec(run: FiledRun, locale: DocumentLocale): DocumentSpec | null {
  const t = T[locale];
  const lang = run.language === 'python' ? 'Python' : 'JavaScript';
  const outBlocks = blocks(run.stdout, t.cut);
  const sections = [
    { heading: t.out, blocks: outBlocks.length ? outBlocks : [{ type: 'paragraph' as const, text: t.none }] },
    ...(run.stderr.trim() ? [{ heading: t.err, blocks: blocks(run.stderr, t.cut) }] : []),
    { heading: t.code, blocks: blocks(run.code, t.cut) },
  ].filter((s) => s.blocks.length > 0);
  const parsed = documentSpecSchema.safeParse({
    title: fill(t.title, { lang }),
    subtitle: fill(t.exit, { code: run.exitCode, sec: (run.wallMs / 1000).toFixed(1) }),
    locale,
    sections,
  });
  return parsed.success ? parsed.data : null;
}

export interface FilingDeps {
  render(spec: DocumentSpec): Promise<Uint8Array>;
  /** Stores the bytes and returns a signed link, or null when Storage refused. */
  upload(path: string, bytes: Buffer): Promise<string | null>;
  /** lib/orchestrator/jobs recordCompletedAsset with serviceType 'document'. */
  record(input: { id: string; userId: string; url: string; title: string }): Promise<boolean>;
  newId(): string;
  now(): Date;
}

/** Renders, stores and files the run. Never throws: false means it is only in the chat. */
export async function fileCodeRun(deps: FilingDeps, input: { userId: string; locale: DocumentLocale; run: FiledRun }): Promise<boolean> {
  try {
    const spec = codeRunSpec(input.run, input.locale);
    if (!spec) return false;
    const bytes = Buffer.from(await deps.render(spec));
    const id = deps.newId();
    const url = await deps.upload(`documents/${input.userId}/${deps.now().toISOString().slice(0, 10)}-code-${id}.pdf`, bytes);
    if (!url) return false;
    return await deps.record({ id, userId: input.userId, url, title: spec.title });
  } catch {
    return false;
  }
}
