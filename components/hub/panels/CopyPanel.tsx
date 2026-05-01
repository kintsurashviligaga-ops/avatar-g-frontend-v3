'use client';

/**
 * CopyPanel — AI Copy / SEO / Marketing text workspace
 * Format selector, tone, length, target audience, SEO helpers
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Copy, Check, AlertCircle, Loader2, RefreshCw, Download, Wand2, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiPipeline } from '@/hooks/useAiPipeline';
import { beginPanelShellRun, createTextPreview } from './panelShellBridge';
import type { PanelRunCallbacks } from '@/types/dashboard';

const FORMATS = [
  { id: 'headline',        label: 'Headline',        emoji: '📰' },
  { id: 'ad-copy',         label: 'Ad Copy',         emoji: '📣' },
  { id: 'product-desc',    label: 'Product Desc',    emoji: '🛒' },
  { id: 'email',           label: 'Email Campaign',  emoji: '📧' },
  { id: 'social-post',     label: 'Social Post',     emoji: '📱' },
  { id: 'landing-page',    label: 'Landing Page',    emoji: '🌐' },
  { id: 'seo-article',     label: 'SEO Article',     emoji: '🔍' },
  { id: 'press-release',   label: 'Press Release',   emoji: '📋' },
  { id: 'youtube-desc',    label: 'YouTube Desc',    emoji: '▶️' },
  { id: 'cta',             label: 'CTA Button',      emoji: '🎯' },
  { id: 'brand-story',     label: 'Brand Story',     emoji: '✨' },
  { id: 'meta-tags',       label: 'Meta Tags',       emoji: '🏷️' },
];

const TONES = [
  { id: 'professional', label: 'Professional' },
  { id: 'friendly',     label: 'Friendly'     },
  { id: 'witty',        label: 'Witty'        },
  { id: 'persuasive',   label: 'Persuasive'   },
  { id: 'authoritative',label: 'Authoritative'},
  { id: 'inspirational',label: 'Inspirational' },
  { id: 'urgent',       label: 'Urgent'        },
  { id: 'casual',       label: 'Casual'        },
];

const LENGTHS = [
  { id: 'short',    label: 'Short',    desc: '~50 words'  },
  { id: 'medium',   label: 'Medium',   desc: '~150 words' },
  { id: 'long',     label: 'Long',     desc: '~400 words' },
  { id: 'detailed', label: 'Detailed', desc: '~800 words' },
];

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'ka', label: 'Georgian (ქართ.)' },
  { id: 'ru', label: 'Russian' },
];

export function CopyPanel({ locale, callbacks }: { locale: string; callbacks?: PanelRunCallbacks }) {
  const [format,   setFormat]   = useState('ad-copy');
  const [tone,     setTone]     = useState('professional');
  const [length,   setLength]   = useState('medium');
  const [lang,     setLang]     = useState(locale === 'ka' ? 'ka' : 'en');
  const [brand,    setBrand]    = useState('');
  const [audience, setAudience] = useState('');
  const [keywords, setKeywords] = useState('');
  const [prompt,   setPrompt]   = useState('');
  const [copied,   setCopied]   = useState(false);

  const { run, loading, error, lastResult, clearError } = useAiPipeline('copy');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const detail = [
      `Format: ${format}`,
      `Tone: ${tone}`,
      `Length: ${length}`,
      `Language: ${lang}`,
      brand     ? `Brand: ${brand}`       : '',
      audience  ? `Audience: ${audience}` : '',
      keywords  ? `Keywords: ${keywords}` : '',
    ].filter(Boolean).join(', ');
    const shellRun = beginPanelShellRun(callbacks, 'text', 'Text Generator', 12);

    await run(
      { prompt, context: detail },
      {
        onSuccess: (result) => {
          shellRun.complete(detail, createTextPreview('Text Generator', detail, result.result));
        },
        onError: (message) => {
          shellRun.fail(message);
        },
      },
    );
  };

  const resultText = lastResult?.result ?? '';

  const handleCopy = () => {
    if (!resultText) return;
    navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center shadow-lg">
            <span className="text-lg">✍️</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Text Generator</h1>
            <p className="text-[12px] text-white/40">Marketing copy, SEO content, and brand text</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_340px] gap-5">
          {/* Left: Input */}
          <div className="space-y-4">

            {/* Format */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Format</p>
              <div className="grid grid-cols-3 gap-2">
                {FORMATS.map(f => (
                  <button key={f.id} onClick={() => setFormat(f.id)}
                    className={cn('flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[11px] font-medium transition-all',
                      format === f.id
                        ? 'border-lime-400/40 bg-lime-400/[0.10] text-lime-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    <span>{f.emoji}</span><span className="truncate">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Topic */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Topic / Brief</p>
                <span className="text-[10px] text-white/25">{prompt.length}/600</span>
              </div>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value.slice(0, 600))}
                placeholder="What is the copy about? Product, campaign, service…"
                rows={3}
                className="w-full px-4 py-3 rounded-2xl border border-white/[0.10] bg-white/[0.03] text-white/80 placeholder:text-white/25 text-[13px] resize-none outline-none focus:border-lime-400/40 focus:bg-lime-400/[0.03] transition-all"
              />
            </div>

            {/* Brand + Audience */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">Brand Name</p>
                <input value={brand} onChange={e => setBrand(e.target.value)}
                  placeholder="Your brand…"
                  className="w-full px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-white/70 placeholder:text-white/25 text-[12px] outline-none focus:border-lime-400/30 transition-all" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">Target Audience</p>
                <input value={audience} onChange={e => setAudience(e.target.value)}
                  placeholder="e.g. Millennials, marketers…"
                  className="w-full px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-white/70 placeholder:text-white/25 text-[12px] outline-none focus:border-lime-400/30 transition-all" />
              </div>
            </div>

            {/* Keywords */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">SEO Keywords (comma-separated)</p>
              <input value={keywords} onChange={e => setKeywords(e.target.value)}
                placeholder="AI platform, avatar creation, digital marketing…"
                className="w-full px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-white/70 placeholder:text-white/25 text-[12px] outline-none focus:border-lime-400/30 transition-all" />
            </div>

            {/* Tone */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Tone of Voice</p>
              <div className="flex gap-2 flex-wrap">
                {TONES.map(t => (
                  <button key={t.id} onClick={() => setTone(t.id)}
                    className={cn('px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition-all',
                      tone === t.id
                        ? 'border-lime-400/40 bg-lime-400/[0.10] text-lime-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2.5 px-4 py-3 rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] text-rose-300">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <p className="text-[12px] flex-1">{error}</p>
                  <button onClick={clearError}>×</button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Generate */}
            <button onClick={handleGenerate} disabled={loading || !prompt.trim()}
              className={cn('w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[14px] font-bold transition-all',
                loading || !prompt.trim()
                  ? 'bg-white/[0.05] border border-white/[0.08] text-white/25 cursor-not-allowed'
                  : 'bg-gradient-to-r from-lime-500 to-green-600 text-white shadow-[0_0_24px_rgba(132,204,22,0.4)] hover:shadow-[0_0_32px_rgba(132,204,22,0.55)] hover:scale-[1.01]')}>
              {loading ? (<><Loader2 size={16} className="animate-spin" />Writing copy…</>) : (<><Sparkles size={16} />Generate Copy  ·  3 credits</>)}
            </button>
          </div>

          {/* Right: Settings + Output */}
          <div className="space-y-4">
            {/* Length */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Length</p>
              <div className="space-y-1.5">
                {LENGTHS.map(l => (
                  <button key={l.id} onClick={() => setLength(l.id)}
                    className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-all',
                      length === l.id
                        ? 'border-lime-400/40 bg-lime-400/[0.10] text-lime-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    <span>{l.label}</span>
                    <span className="text-[10px] opacity-60">{l.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Output Language</p>
              <div className="space-y-1.5">
                {LANGUAGES.map(l => (
                  <button key={l.id} onClick={() => setLang(l.id)}
                    className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-all',
                      lang === l.id
                        ? 'border-lime-400/40 bg-lime-400/[0.10] text-lime-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    <Globe size={12} />{l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Output */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Output</p>
                {resultText && (
                  <div className="flex gap-1.5">
                    <button onClick={handleCopy}
                      className={cn('flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-all',
                        copied ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/[0.10] bg-white/[0.04] text-white/50 hover:text-white/80')}>
                      {copied ? <Check size={10} /> : <Copy size={10} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button className="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/[0.10] bg-white/[0.04] text-white/50 hover:text-white/80 text-[10px] font-semibold">
                      <Download size={10} /> Export
                    </button>
                    <button onClick={handleGenerate} disabled={loading}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/[0.10] bg-white/[0.04] text-white/50 hover:text-white/80 text-[10px] font-semibold disabled:opacity-30">
                      <RefreshCw size={10} />
                    </button>
                  </div>
                )}
              </div>
              <div className={cn(
                'rounded-2xl border border-white/[0.08] bg-white/[0.02] min-h-[180px] p-4',
                loading && 'animate-pulse',
              )}>
                {loading ? (
                  <div className="space-y-2">
                    {[80, 95, 70, 88, 60].map((w, i) => (
                      <div key={i} className="h-3 rounded-full bg-white/[0.06]" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : resultText ? (
                  <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">{resultText}</p>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center text-white/20">
                      <Wand2 size={28} className="mx-auto mb-2" />
                      <p className="text-[12px]">Generated copy will appear here</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
