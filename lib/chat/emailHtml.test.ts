/** @jest-environment node */
import { escapeHtml, markdownToEmailHtml } from './emailHtml';

describe('escapeHtml', () => {
  test('escapes the five significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('markdownToEmailHtml', () => {
  test('renders a GFM table as a bordered <table> in an overflow container', () => {
    const md = ['| Item | Qty |', '| --- | --- |', '| Apples | 3 |', '| Pears | 5 |'].join('\n');
    const html = markdownToEmailHtml(md);
    expect(html).toContain('<table');
    expect(html).toContain('overflow-x:auto');
    expect(html).toContain('<th');
    expect(html).toContain('Apples');
    expect(html).toContain('<td');
    // exactly two body rows
    expect((html.match(/<tr>/g) || []).length).toBe(3); // 1 header row + 2 body rows
  });

  test('non-table lines become paragraphs, and content is XSS-escaped', () => {
    const html = markdownToEmailHtml('Here is <script>alert(1)</script> and **bold**');
    expect(html).toContain('<p');
    expect(html).toContain('&lt;script&gt;');       // escaped, not executable
    expect(html).not.toContain('<script>');
    expect(html).toContain('<strong>bold</strong>'); // inline bold survives
  });

  test('a lone pipe line without a separator is NOT treated as a table', () => {
    const html = markdownToEmailHtml('| this is just text with a pipe |');
    expect(html).not.toContain('<table');
    expect(html).toContain('<p');
  });

  test('empty input → empty string', () => {
    expect(markdownToEmailHtml('')).toBe('');
  });
});
