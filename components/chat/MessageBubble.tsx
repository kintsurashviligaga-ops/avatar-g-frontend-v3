'use client';

import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check } from 'lucide-react';
import type { Components } from 'react-markdown';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: Date;
}

interface MessageBubbleProps {
  message: ChatMessageData;
  isStreaming?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-white/[0.06] transition-colors"
      title={copied ? 'კოპირებულია' : 'კოპირება'}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;
    const language = (className ?? '').replace('language-', '');
    const codeText = String(children).replace(/\n$/, '');

    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded bg-white/[0.08] text-cyan-300 text-[0.85em] font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <div className="relative group my-3 rounded-xl overflow-hidden border border-white/10">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-white/[0.05] border-b border-white/10">
          <span className="text-white/40 text-xs font-mono">{language || 'code'}</span>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(codeText);
              } catch {
                // ignore
              }
            }}
            className="flex items-center gap-1 text-white/40 hover:text-cyan-400 text-xs transition-colors"
          >
            <Copy className="w-3 h-3" />
            copy
          </button>
        </div>
        <pre className="p-4 overflow-x-auto bg-black/40 text-sm">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  p({ children }) {
    return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
  },
  ul({ children }) {
    return <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>;
  },
  li({ children }) {
    return <li className="text-white/80">{children}</li>;
  },
  h1({ children }) {
    return <h1 className="text-xl font-bold text-white mb-2 mt-4">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-lg font-semibold text-white mb-2 mt-3">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-base font-semibold text-white/90 mb-1.5 mt-2">{children}</h3>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-cyan-400/40 pl-4 my-3 text-white/60 italic">
        {children}
      </blockquote>
    );
  },
  a({ children, href }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300 transition-colors"
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border border-white/10 px-3 py-2 bg-white/[0.05] text-left text-white/80 font-medium">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="border border-white/10 px-3 py-2 text-white/70">{children}</td>
    );
  },
  strong({ children }) {
    return <strong className="font-semibold text-white">{children}</strong>;
  },
  hr() {
    return <hr className="border-white/10 my-4" />;
  },
};

export default function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 px-4 group">
        <div className="relative max-w-[75%]">
          <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-2xl rounded-tr-sm px-4 py-3">
            <p className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
          {/* Copy button */}
          <div className="absolute -bottom-6 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={message.content} />
          </div>
        </div>
      </div>
    );
  }

  if (isAssistant) {
    return (
      <div className="flex gap-3 mb-4 px-4 group">
        {/* Avatar */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center mt-0.5">
          <span className="text-cyan-400 text-xs font-bold">G</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-white/85 text-sm leading-relaxed">
            {message.content ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={markdownComponents}
              >
                {message.content}
              </ReactMarkdown>
            ) : null}
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-cyan-400 ml-0.5 animate-pulse align-middle" />
            )}
          </div>

          {/* Actions */}
          {!isStreaming && message.content && (
            <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton text={message.content} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
