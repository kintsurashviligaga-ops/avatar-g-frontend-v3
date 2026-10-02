/**
 * /api/connectors/files — the user's own documents, kept as TEXT for research (lib/connectors/localFiles.ts).
 *
 *   GET     → { files: ConnectorFile[], limits }                         (signed in)
 *   POST    { name, mimeType?, bytes?, text } → 201 { file }             the TEXT extracted by /api/utils/extract-text (the
 *           browser reads the PDF / TXT / MD / DOCX and posts it there first); nothing but text is stored
 *             400 empty (no readable text — a scanned PDF, say) / invalid · 409 too_many (the per-account cap) · 413 too large
 *   DELETE  ?id=<uuid> → { ok: true }                                    only the caller's own (404 otherwise)
 *
 * Signed-in only: a guest has no account to keep documents in. Everything is scoped to the verified user id by hand (the table
 * has no client write policy); per-account daily write limit on top of the IP burst guard. While the table is not migrated
 * every method answers 503 `unavailable` (the Connectors view shows "opening soon").
 */
import { NextRequest } from 'next/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { RESEARCH_ATTACH_MAX, RESEARCH_CONTEXT_MAX_CHARS, RESEARCH_FILES_MAX, RESEARCH_FILE_MAX_CHARS } from '@/lib/research/context';
import { tableReady } from '@/lib/research/capabilities';
import { callerId, json } from '@/lib/research/http';
import { researchMessage } from '@/lib/research/messages';
import { RESEARCH_FILES_USER } from '@/lib/research/rateLimits';
import { getResearchRuntime } from '@/lib/research/runtime';
import { reportError } from '@/lib/observability/report-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

/** One document's request body: ≤ 30,000 characters of text (≤ ~90 KB) + a name — anything near this is a mistake or an attack. */
const MAX_BODY_CHARS = 400_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIMITS = { maxFiles: RESEARCH_FILES_MAX, maxFileChars: RESEARCH_FILE_MAX_CHARS, maxAttach: RESEARCH_ATTACH_MAX, maxContextChars: RESEARCH_CONTEXT_MAX_CHARS };

const MSG = {
  empty: { ka: 'ფაილში წასაკითხი ტექსტი ვერ ვიპოვეთ (სკანირებული PDF?). სცადე სხვა ფაილი.', en: 'We could not find readable text in that file (a scanned PDF?). Try another file.', ru: 'В файле не удалось найти читаемый текст (скан PDF?). Попробуйте другой файл.' },
  too_many: { ka: `შეგიძლია შეინახო მაქსიმუმ ${RESEARCH_FILES_MAX} დოკუმენტი. წაშალე ერთი და სცადე თავიდან.`, en: `You can keep up to ${RESEARCH_FILES_MAX} documents. Delete one and try again.`, ru: `Можно хранить до ${RESEARCH_FILES_MAX} документов. Удалите один и попробуйте снова.` },
  invalid: { ka: 'ფაილი ვერ დამუშავდა.', en: 'That file could not be processed.', ru: 'Не удалось обработать файл.' },
  too_large: { ka: 'ფაილი ძალიან დიდია.', en: 'That file is too large.', ru: 'Файл слишком большой.' },
} as const;
const msg = (k: keyof typeof MSG, loc: unknown) => MSG[k][loc === 'en' || loc === 'ru' ? loc : 'ka'];

async function gate(req: NextRequest) {
  const userId = await callerId(req);
  if (!userId || mustSignInToGenerate(userId)) return { res: json(signInToGenerateBody(), 401) } as const;
  const rt = getResearchRuntime();
  if (!rt || !(await tableReady(rt.db as never, 'research_context_files'))) {
    return { res: json({ error: 'unavailable', message: researchMessage('unavailable') }, 503) } as const;
  }
  return { userId, rt } as const;
}

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;
  const g = await gate(req);
  if ('res' in g) return g.res;
  try {
    return json({ files: await g.rt.files.list(g.userId), limits: LIMITS });
  } catch (e) {
    reportError(e, { route: '/api/connectors/files', stage: 'list' });
    return json({ error: 'unavailable', message: researchMessage('unavailable') }, 503);
  }
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;
  const g = await gate(req);
  if ('res' in g) return g.res;
  const perUser = await checkRateLimitByKey(g.userId, RESEARCH_FILES_USER);
  if (perUser) return perUser;

  const text = await req.text().catch(() => '');
  if (text.length > MAX_BODY_CHARS) return json({ error: 'too_large', message: msg('too_large', null) }, 413);
  let body: { name?: unknown; mimeType?: unknown; bytes?: unknown; text?: unknown; locale?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as typeof body;
  } catch {
    return json({ error: 'invalid', message: msg('invalid', null) }, 400);
  }

  const out = await g.rt.files.add(g.userId, { name: body.name, mimeType: body.mimeType, bytes: body.bytes, text: body.text });
  if (out.ok) return json({ file: out.file, limits: LIMITS }, 201);
  if (out.code === 'too_many') return json({ error: 'too_many', message: msg('too_many', body.locale) }, 409);
  if (out.code === 'empty') return json({ error: 'empty', message: msg('empty', body.locale) }, 400);
  if (out.code === 'invalid') return json({ error: 'invalid', message: msg('invalid', body.locale) }, 400);
  return json({ error: 'unavailable', message: researchMessage('unavailable', typeof body.locale === 'string' ? body.locale : null) }, 503);
}

export async function DELETE(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;
  const g = await gate(req);
  if ('res' in g) return g.res;
  const perUser = await checkRateLimitByKey(g.userId, RESEARCH_FILES_USER);
  if (perUser) return perUser;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!UUID_RE.test(id)) return json({ error: 'not_found', message: researchMessage('not_found') }, 404);
  try {
    const removed = await g.rt.files.remove(g.userId, id);
    return removed ? json({ ok: true }) : json({ error: 'not_found', message: researchMessage('not_found') }, 404);
  } catch (e) {
    reportError(e, { route: '/api/connectors/files', stage: 'delete' });
    return json({ error: 'unavailable', message: researchMessage('unavailable') }, 503);
  }
}
