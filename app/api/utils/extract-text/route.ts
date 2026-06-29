/**
 * POST /api/utils/extract-text — decode a BINARY document attachment to plain text so
 * the film Director can read an attached script. The browser can already decode plain
 * text (.txt/.md) itself (OmniStudio.extractScriptText); this route covers the formats
 * it can't: PDF (pdf-parse) and DOCX (mammoth).
 *
 * Body: { dataUrl: string (data: or bare base64), mimeType?: string } → { text: string }.
 * Fail-open at every step → { text: '' } so a parser hiccup never blocks generation
 * (the caller then proceeds with no script, exactly as before).
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function decodeDataUrl(dataUrl: string): Buffer | null {
  try {
    const comma = dataUrl.indexOf(',');
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const buf = Buffer.from(b64, 'base64');
    return buf.byteLength ? buf : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const debug = String(req.url || '').includes('debug=1');
  try {
    const body = (await req.json().catch(() => ({}))) as { dataUrl?: unknown; mimeType?: unknown };
    if (typeof body.dataUrl !== 'string') return NextResponse.json({ text: '', ...(debug ? { _d: 'no-dataurl' } : {}) });
    const buf = decodeDataUrl(body.dataUrl);
    if (!buf) return NextResponse.json({ text: '', ...(debug ? { _d: 'no-buf' } : {}) });

    const mt = String(body.mimeType ?? '').toLowerCase();
    const isPdf = /pdf/.test(mt) || buf.subarray(0, 5).toString('latin1') === '%PDF-';
    // DOCX is a zip (magic PK\x03\x04); also match the office/word mime types.
    const isDocx = !isPdf && (/wordprocessingml|officedocument|msword|docx/.test(mt) || (buf[0] === 0x50 && buf[1] === 0x4b));

    if (isPdf) {
      try {
        // unpdf bundles a SERVERLESS-safe pdfjs build — pdf-parse worked locally but
        // returned EMPTY in the Vercel lambda (its pdfjs worker/assets aren't bundled),
        // which is exactly why uploaded PDFs silently failed and the storyboard went generic.
        const { extractText, getDocumentProxy } = await import('unpdf');
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const { text } = await extractText(pdf, { mergePages: true });
        const out = String(Array.isArray(text) ? text.join('\n') : text ?? '').replace(/\n{3,}/g, '\n\n').trim();
        return NextResponse.json({ text: out, ...(debug ? { _d: `unpdf-ok bytes=${buf.length} chars=${out.length}` } : {}) });
      } catch (e) {
        return NextResponse.json({ text: '', ...(debug ? { _d: `unpdf-throw bytes=${buf.length}: ${e instanceof Error ? (e.stack || e.message) : String(e)}`.slice(0, 600) } : {}) });
      }
    }

    if (isDocx) {
      try {
        const mammoth = await import('mammoth');
        const extract = (mammoth as { extractRawText?: (o: { buffer: Buffer }) => Promise<{ value: string }> }).extractRawText
          ?? (mammoth as { default?: { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> } }).default?.extractRawText;
        if (!extract) return NextResponse.json({ text: '' });
        const r = await extract({ buffer: buf });
        return NextResponse.json({ text: String(r?.value ?? '').trim() });
      } catch {
        return NextResponse.json({ text: '' });
      }
    }

    // Plain-text fallback (utf-8) — bounded so a huge file can't bloat the brief.
    return NextResponse.json({ text: buf.toString('utf-8').slice(0, 20_000).trim() });
  } catch {
    return NextResponse.json({ text: '' });
  }
}
