/**
 * POST /api/documents/create — Agent G writes a document and returns it as a real PDF file (Master Task v2.0, Phase 1).
 *
 *   body  { prompt: string, locale?: 'ka' | 'en' | 'ru' }
 *   200   { ok: true, url, fileName, title, pages, bytes, expiresAt }      the PDF is in Storage behind a signed link
 *   200   { ok: true, url: null, data: <base64>, … }                      Storage refused it: the bytes come back inline
 *   400 invalid · 401 signed out · 429 limit · 502 not_written (Gemini gave no valid document)
 *
 * Gemini writes the content (lib/documents/compose, held to lib/documents/spec), and pdf-lib draws it with FiraGO
 * (lib/documents/pdf), so Georgian survives. No new provider and no paid infrastructure. The model call is the same
 * llmText budget-guarded call the chat uses, so it is FREE to the user and capped per account per day instead of priced.
 * Pricing is the owner's call (OWNER_APPROVED_PRICING), like every other free operation.
 *
 * Signed-in only: the file belongs to an account and lives under documents/<user id>/.
 */
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { checkRateLimit, checkRateLimitByKey, refundRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { composeDocument } from '@/lib/documents/compose';
import { renderDocumentPdf } from '@/lib/documents/pdf';
import { DOCUMENT_LOCALES, documentFileName } from '@/lib/documents/spec';
import { reportError } from '@/lib/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DOCUMENT_BUCKET = 'renders';
const WEEK_SEC = 604_800;

const bodySchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  locale: z.enum(DOCUMENT_LOCALES).optional(),
});

const MESSAGES = {
  not_written: {
    ka: 'დოკუმენტის დაწერა ვერ მოხერხდა. სცადე ცოტა ხანში ან მოთხოვნა დააზუსტე.',
    en: 'The document could not be written. Try again shortly or make the request more specific.',
    ru: 'Не удалось написать документ. Попробуйте позже или уточните запрос.',
  },
} as const;

export async function POST(req: NextRequest) {
  const burst = await checkRateLimit(req, RATE_LIMITS.WRITE, 'documents');
  if (burst) return burst;
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid', issues: parsed.error.issues.slice(0, 3) }, { status: 400 });
  const { prompt } = parsed.data;
  const locale = parsed.data.locale ?? 'ka';

  // Counted up front so two requests at once cannot both slip under the daily cap; given back when nothing was made.
  const daily = await checkRateLimitByKey(user.id, RATE_LIMITS.DOCUMENT_DAILY);
  if (daily) return daily;

  try {
    const spec = await composeDocument(prompt, locale, req.signal);
    if (!spec) {
      await refundRateLimitByKey(user.id, RATE_LIMITS.DOCUMENT_DAILY);
      return NextResponse.json({ error: 'not_written', message: MESSAGES.not_written[locale] }, { status: 502 });
    }
    const pdf = await renderDocumentPdf(spec);
    const buf = Buffer.from(pdf.bytes);
    const fileName = documentFileName(spec.title);
    const path = `documents/${user.id}/${new Date().toISOString().slice(0, 10)}-${randomUUID()}.pdf`;
    const url = await uploadBufferAndSign(DOCUMENT_BUCKET, path, buf, 'application/pdf', WEEK_SEC);
    const meta = { ok: true, fileName, title: spec.title, pages: pdf.pages, bytes: buf.byteLength, locale: spec.locale };
    if (!url) return NextResponse.json({ ...meta, url: null, data: buf.toString('base64') }, { headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(
      { ...meta, url, path, expiresAt: new Date(Date.now() + WEEK_SEC * 1000).toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    await refundRateLimitByKey(user.id, RATE_LIMITS.DOCUMENT_DAILY);
    reportError(e, { route: '/api/documents/create' });
    return NextResponse.json({ error: 'not_written', message: MESSAGES.not_written[locale] }, { status: 502 });
  }
}
