/**
 * VECTOR 2 — chat-reply → email-safe HTML. Renders a markdown reply (incl. GFM tables) into clean,
 * responsive, XSS-safe HTML for the Resend dispatcher. Pure → unit-testable (no server-only imports).
 */

/** Escape the five HTML-significant characters. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Minimal inline markdown (**bold**, `code`) applied to ALREADY-ESCAPED text. */
function inlineMd(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+?)`/g, '<code style="background:#f4f4f5;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>');
}

function splitMdRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

const isMdRow = (l: string): boolean => /^\s*\|.*\|\s*$/.test(l);
const isMdSep = (l: string): boolean => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-') && l.includes('|');

/**
 * Render markdown (possibly with GFM tables) as email-client-safe HTML. GFM tables become bordered
 * `<table>`s in an overflow-x container (readable on mobile mail clients); other lines become paragraphs.
 * Everything is escaped first, so the output is XSS-safe. Pure + deterministic.
 */
export function markdownToEmailHtml(md: string): string {
  if (!md || !md.trim()) return '';
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isMdRow(line) && isMdSep(lines[i + 1] ?? '')) {
      const header = splitMdRow(line);
      i += 2; // consume header + separator
      const rows: string[][] = [];
      while (i < lines.length && isMdRow(lines[i] ?? '')) { rows.push(splitMdRow(lines[i] ?? '')); i += 1; }
      const th = header.map((h) => `<th style="border:1px solid #d4d4d8;padding:8px 11px;background:#f4f4f5;text-align:left;font-weight:700">${inlineMd(escapeHtml(h))}</th>`).join('');
      const trs = rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #d4d4d8;padding:8px 11px;text-align:left;vertical-align:top">${inlineMd(escapeHtml(c))}</td>`).join('')}</tr>`).join('');
      out.push(`<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:13px"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`);
      continue;
    }
    if (line.trim() === '') { out.push('<div style="height:8px"></div>'); }
    else { out.push(`<p style="margin:0 0 8px">${inlineMd(escapeHtml(line))}</p>`); }
    i += 1;
  }
  return out.join('');
}
