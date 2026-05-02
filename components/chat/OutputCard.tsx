'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ServiceId } from '@/lib/registry';
import { SERVICE_REGISTRY, SERVICE_OUTPUT_KINDS } from '@/lib/registry';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OutputKind = 'image' | 'video' | 'audio' | 'text' | 'code';

export interface OutputCardProps {
  service: ServiceId;
  outputKind?: OutputKind;
  resultUrl?: string;
  resultText?: string;
  creditCost: number;
  tokensUsed?: number;
  locale?: string;
  onNewRequest: () => void;
  onShare?: () => void;
  onDownload?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function t(key: string, locale: string): string {
  const strings: Record<string, Record<string, string>> = {
    ready:        { ka: 'მზადაა!', en: 'Ready!', ru: 'Готово!' },
    download:     { ka: 'გადმოწერა', en: 'Download', ru: 'Скачать' },
    share:        { ka: 'გაზიარება', en: 'Share', ru: 'Поделиться' },
    newRequest:   { ka: 'ახალი მოთხოვნა', en: 'New Request', ru: 'Новый запрос' },
    credits:      { ka: 'კრ.', en: 'cr.', ru: 'кр.' },
    spent:        { ka: 'დახარჯული', en: 'Spent', ru: 'Потрачено' },
    tokens:       { ka: 'ტოკენი', en: 'tokens', ru: 'токенов' },
    copyCode:     { ka: 'კოდის კოპირება', en: 'Copy Code', ru: 'Копировать код' },
    copied:       { ka: 'დაკოპირდა!', en: 'Copied!', ru: 'Скопировано!' },
    copyText:     { ka: 'ტექსტის კოპირება', en: 'Copy Text', ru: 'Копировать текст' },
  };
  return strings[key]?.[locale] ?? strings[key]?.['en'] ?? key;
}

// ─── Output renderers ─────────────────────────────────────────────────────────

function ImageOutput({ url }: { url: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Generated" className="w-full object-cover" />
    </div>
  );
}

function VideoOutput({ url }: { url: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video src={url} controls className="w-full rounded-xl" />
    </div>
  );
}

function AudioOutput({ url }: { url: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex justify-center">
        <span className="text-3xl">🎵</span>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio src={url} controls className="w-full" />
    </div>
  );
}

function TextOutput({ text, locale }: { text: string; locale: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] text-white/50 transition hover:border-white/20 hover:text-white/80"
      >
        {copied ? t('copied', locale) : t('copyText', locale)}
      </button>
      <div
        className="prose prose-invert max-h-96 overflow-y-auto p-4 pt-8 text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br/>') }}
      />
    </div>
  );
}

function CodeOutput({ text, locale }: { text: string; locale: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative rounded-xl border border-emerald-400/20 bg-black/30">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300/70 transition hover:bg-emerald-400/20 hover:text-emerald-200"
      >
        {copied ? t('copied', locale) : t('copyCode', locale)}
      </button>
      <pre className="max-h-96 overflow-auto p-4 pt-8 text-[11px] leading-relaxed text-emerald-200/80">
        <code>{text}</code>
      </pre>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OutputCard({
  service,
  outputKind,
  resultUrl,
  resultText,
  creditCost,
  tokensUsed,
  locale = 'ka',
  onNewRequest,
  onShare,
  onDownload,
}: OutputCardProps) {
  const serviceInfo = SERVICE_REGISTRY.find(s => s.id === service);
  const serviceName = serviceInfo
    ? (typeof serviceInfo.name === 'object'
        ? (serviceInfo.name as Record<string, string>)[locale] ?? (serviceInfo.name as Record<string, string>)['en']
        : String(serviceInfo.name))
    : service;

  const kind: OutputKind = outputKind ?? SERVICE_OUTPUT_KINDS[service] ?? 'text';

  const renderOutput = () => {
    if (kind === 'image' && resultUrl)   return <ImageOutput url={resultUrl} />;
    if (kind === 'video' && resultUrl)   return <VideoOutput url={resultUrl} />;
    if (kind === 'audio' && resultUrl)   return <AudioOutput url={resultUrl} />;
    if (kind === 'code' && resultText)   return <CodeOutput text={resultText} locale={locale} />;
    if (kind === 'text' && resultText)   return <TextOutput text={resultText} locale={locale} />;
    return null;
  };

  const output = renderOutput();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.1 }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300"
        >
          ✓
        </motion.div>
        <div>
          <p className="text-xs text-white/40">{serviceName}</p>
          <p className="text-sm font-bold text-white">{t('ready', locale)}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-[9px] text-white/30">{t('spent', locale)}</p>
            <p className="text-xs font-bold text-amber-300">
              {creditCost} {t('credits', locale)}
            </p>
          </div>
          {tokensUsed !== undefined && (
            <div className="text-right">
              <p className="text-[9px] text-white/30">{t('tokens', locale)}</p>
              <p className="text-xs font-semibold text-white/50">{tokensUsed.toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Output content */}
      {output && <div className="mb-4">{output}</div>}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onNewRequest}
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-xs font-medium text-white/60 transition hover:border-white/20 hover:text-white/80"
        >
          + {t('newRequest', locale)}
        </button>
        {(kind === 'image' || kind === 'video' || kind === 'audio') && resultUrl && onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className={cn(
              'rounded-xl border px-4 py-2.5 text-xs font-medium transition',
              'border-cyan-400/30 text-cyan-300 hover:border-cyan-400/50 hover:bg-cyan-400/10',
            )}
          >
            ↓ {t('download', locale)}
          </button>
        )}
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-medium text-white/40 transition hover:border-white/20 hover:text-white/60"
          >
            ↗ {t('share', locale)}
          </button>
        )}
      </div>
    </motion.div>
  );
}
