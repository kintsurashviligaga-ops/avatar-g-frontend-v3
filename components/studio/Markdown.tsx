'use client';

/**
 * Markdown — renders an assistant reply as rich, minimalist markdown so the
 * chatbox reads like a top-tier modern assistant (bold, lists, headings, links,
 * tables, inline + fenced code with a copy button). Strictly theme-token styled
 * (`app-*`) so it flips light/dark. GitHub-flavoured markdown via remark-gfm.
 */

import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ }
  };
  return (
    <div className="group relative my-2">
      <pre className="overflow-x-auto rounded-xl bg-app-bg/70 p-3 text-[12.5px] leading-[1.5] ring-1 ring-app-border/10">
        <code className="font-mono text-app-text">{text}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label="copy code"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-app-elevated text-app-muted opacity-0 transition hover:text-app-accent group-hover:opacity-100 focus:opacity-100"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

// PERF (Master Contract V5) — memoized on the `children` string. The dashboard chat maps every history
// bubble through <Markdown>, so WITHOUT this every keystroke in the composer (a parent state change) re-parsed
// the full markdown AST of EVERY bubble → visible input latency on long sessions. Same string ⇒ skip re-render.
function MarkdownImpl({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-[16px] leading-[1.7] [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-app-accent underline-offset-2 hover:underline" />,
          // Render any inline markdown image as a clean framed picture (not raw text/alt).
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          img: ({ node: _n, ...props }) => <img {...props} loading="lazy" className="my-2 max-h-[60vh] max-w-full rounded-xl bg-black/20 object-contain ring-1 ring-app-border/10" />,
          p: ({ node: _n, ...props }) => <p {...props} className="whitespace-pre-wrap break-words" />,
          ul: ({ node: _n, ...props }) => <ul {...props} className="list-disc space-y-1 pl-5" />,
          ol: ({ node: _n, ...props }) => <ol {...props} className="list-decimal space-y-1 pl-5" />,
          li: ({ node: _n, ...props }) => <li {...props} className="marker:text-app-muted" />,
          strong: ({ node: _n, ...props }) => <strong {...props} className="font-semibold text-app-text" />,
          em: ({ node: _n, ...props }) => <em {...props} className="italic" />,
          h1: ({ node: _n, ...props }) => <h1 {...props} className="mb-1 mt-3 text-[18px] font-semibold" />,
          h2: ({ node: _n, ...props }) => <h2 {...props} className="mb-1 mt-3 text-[16px] font-semibold" />,
          h3: ({ node: _n, ...props }) => <h3 {...props} className="mb-1 mt-2 text-[15px] font-semibold" />,
          blockquote: ({ node: _n, ...props }) => <blockquote {...props} className="border-l-2 border-app-accent/40 pl-3 italic text-app-muted" />,
          hr: () => <hr className="my-3 border-app-border/10" />,
          table: ({ node: _n, ...props }) => <div className="my-2 overflow-x-auto"><table {...props} className="w-full text-[13px]" /></div>,
          th: ({ node: _n, ...props }) => <th {...props} className="border border-app-border/15 bg-app-elevated px-2 py-1 text-left font-semibold" />,
          td: ({ node: _n, ...props }) => <td {...props} className="border border-app-border/10 px-2 py-1" />,
          // Unwrap the default <pre> — our CodeBlock provides its own, so block
          // code never nests <pre><div><pre>.
          pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
          code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
            const text = String(children ?? '');
            // Fenced (block) code: has a language-* class OR spans multiple lines.
            const isBlock = /language-/.test(className || '') || text.includes('\n');
            if (isBlock) return <CodeBlock text={text.replace(/\n$/, '')} />;
            return <code className="rounded bg-app-elevated px-1.5 py-0.5 font-mono text-[13px] text-app-accent">{children}</code>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);

export default Markdown;
