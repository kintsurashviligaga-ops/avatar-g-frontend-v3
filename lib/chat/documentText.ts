/**
 * lib/chat/documentText.ts — a document the chat can actually READ.
 *
 * ⚠️ A .docx USED TO REACH THE MODEL AS RAW BYTES. Word files are not on Gemini's inline list, so the serializer replaced
 * them with "[attached file … this format cannot be read here]" — the chat accepted the attachment and then could not answer a
 * question about it. A Word file now goes through /api/utils/extract-text (mammoth, local, no provider spend) and travels as
 * `text/plain` under its own name; .txt / .md are decoded in the browser. The text is capped (≈ 25 k tokens) and the chip says
 * so when it was cut. Empty or unreadable → null (the caller says "couldn't read it" instead of attaching nothing).
 */
import { MAX_DOC_TEXT_CHARS, capDocText, mimeForFile, textToDataUrl } from '@/components/chat/composer/useAttachments';

export interface DocumentDeps {
  readText: (file: File) => Promise<string>;
  readDataUrl: (file: File) => Promise<string>;
  fetch: typeof fetch;
}

export async function documentToText(
  file: File,
  kind: 'text' | 'doc',
  deps: DocumentDeps,
  extractTextUrl = '/api/utils/extract-text',
): Promise<{ dataUrl: string; mimeType: 'text/plain'; truncated: boolean } | null> {
  let text = '';
  if (kind === 'text') {
    text = await deps.readText(file);
  } else {
    const dataUrl = await deps.readDataUrl(file);
    const res = await deps.fetch(extractTextUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ dataUrl, mimeType: mimeForFile(file) }),
    });
    const j = (await res.json().catch(() => ({}))) as { text?: unknown };
    text = res.ok && typeof j.text === 'string' ? j.text : '';
  }
  // A BOM and stray NULs make Gemini read garbage; whitespace-only counts as unreadable.
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/^﻿/, '').replace(/\u0000/g, '');
  if (!clean.trim()) return null;
  const capped = capDocText(clean, MAX_DOC_TEXT_CHARS);
  return { dataUrl: textToDataUrl(capped.text), mimeType: 'text/plain', truncated: capped.truncated };
}
