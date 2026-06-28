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
  try {
    const body = (await req.json().catch(() => ({}))) as { dataUrl?: unknown; mimeType?: unknown };
    if (typeof body.dataUrl !== 'string') return NextResponse.json({ text: '' });
    const buf = decodeDataUrl(body.dataUrl);
    if (!buf) return NextResponse.json({ text: '' });

    const mt = String(body.mimeType ?? '').toLowerCase();
    const isPdf = /pdf/.test(mt) || buf.subarray(0, 5).toString('latin1') === '%PDF-';
    // DOCX is a zip (magic PK\x03\x04); also match the office/word mime types.
    const isDocx = !isPdf && (/wordprocessingml|officedocument|msword|docx/.test(mt) || (buf[0] === 0x50 && buf[1] === 0x4b));

    if (isPdf) {
      try {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: buf });
        const r = await parser.getText();
        // Strip the "-- N of M --" page markers pdf-parse inserts between pages.
        const text = String(r?.text ?? '').replace(/^-- \d+ of \d+ --$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
        return NextResponse.json({ text });
      } catch {
        return NextResponse.json({ text: '' });
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
