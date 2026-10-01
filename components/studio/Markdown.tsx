'use client';

/**
 * Markdown — renders an assistant reply as rich markdown in the dashboard chat.
 *
 * It is now a thin wrapper over `components/chat/MarkdownView.tsx`, the shared renderer: GFM tables, code
 * blocks with a language label and an always-visible copy button, lazily loaded syntax highlighting and
 * KaTeX math, sanitized links, all on the `app-*` theme tokens. The export and the `children` prop are
 * unchanged, so OmniStudio's call sites keep working as they are.
 */

import { memo } from 'react';
import { MarkdownView } from '@/components/chat/MarkdownView';

export interface MarkdownProps {
  children: string;
  /** True while the reply is still streaming: the newest block fades in (no caret — Gemini style). */
  streaming?: boolean;
  /** Labels the code copy button (defaults to English). */
  locale?: 'ka' | 'en' | 'ru';
}

// PERF (Master Contract V5) — memoized on the `children` string. The dashboard chat maps every history
// bubble through <Markdown>, so WITHOUT this every keystroke in the composer (a parent state change) re-parsed
// the full markdown AST of EVERY bubble → visible input latency on long sessions. Same string ⇒ skip re-render.
function MarkdownImpl({ children, streaming, locale }: MarkdownProps) {
  return <MarkdownView source={children} streaming={streaming} locale={locale} />;
}

export const Markdown = memo(MarkdownImpl);

export default Markdown;
