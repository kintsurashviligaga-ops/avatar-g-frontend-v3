'use client';

import { useState } from 'react';
import { FileText, Zap, Wand2, RefreshCw, Copy, Check } from 'lucide-react';

const TYPES = [
  { id: 'landing', label: 'Landing Page', desc: 'სარეკლამო გვერდი' },
  { id: 'social', label: 'Social Media', desc: 'სოც.მედია პოსტი' },
  { id: 'email', label: 'Email Campaign', desc: 'ელ-ფოსტის კამპანია' },
  { id: 'seo', label: 'SEO Blog Post', desc: 'SEO ბლოგ პოსტი' },
  { id: 'ad', label: 'Ad Copy', desc: 'სარეკლამო ტექსტი' },
  { id: 'product', label: 'Product Description', desc: 'პროდუქტის აღწერა' },
];

const TONES = ['Professional', 'Friendly', 'Persuasive', 'Informative', 'Creative', 'Bold'];
const LENGTHS = ['Short (50 words)', 'Medium (150 words)', 'Long (400 words)', 'Extended (800 words)'];

export default function CopyPage() {
  const [type, setType] = useState('landing');
  const [tone, setTone] = useState('Professional');
  const [length, setLength] = useState('Medium (150 words)');
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!topic.trim() || loading) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1500));
    setResult(`✨ ${TYPES.find(t => t.id === type)?.label} — ${tone} Tone\n\n🎯 **${topic}**\n\nდღეს, AI ტექნოლოგიის ერაში, MyAvatar.ge გთავაზობთ ${topic.toLowerCase()}-ის სრულ გადაწყვეტას. ჩვენი პლატფორმა განსაკუთრებულია, რადგან გაძლევს საშუალებას შექმნა პროფესიონალური კონტენტი წამებში.\n\n**რატომ ჩვენ?**\n• AI-ზე დაფუძნებული ინსტრუმენტები\n• 18 სხვადასხვა სერვისი ერთ ადგილას\n• ქართული ენის მხარდაჭერა\n• კონკურენტული ფასი\n\n${keywords ? `**Keywords:** ${keywords}\n\n` : ''}**CTA:** დაიწყე უფასო საცდელი პერიოდი — myavatar.ge`);
    setLoading(false);
  };

  const copy = () => {
    if (result) {
      navigator.clipboard.writeText(result).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#06b6d418', border: '1px solid #06b6d440' }}>
          <FileText className="w-5 h-5" style={{ color: '#06b6d4' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Text & Copy</h1>
          <p className="text-xs text-white/40">მარკეტინგული ტექსტი და კონტენტი</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs" style={{ background: '#06b6d418', border: '1px solid #06b6d430', color: '#67e8f9' }}>
          <Zap className="w-3 h-3" /> 10 credits/copy
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Content Type</label>
            <div className="space-y-1.5">
              {TYPES.map(t => (
                <button key={t.id} onClick={() => setType(t.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all"
                  style={type === t.id ? { background: '#06b6d418', border: '1px solid #06b6d440' } : { background: 'rgba(255,255,255,0.02)', border: '1px solid transparent' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: type === t.id ? '#67e8f9' : 'rgba(255,255,255,0.7)' }}>{t.label}</p>
                    <p className="text-[10px] text-white/35">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Topic / Brand</label>
            <textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="კონტენტის თემა ან ბრენდის სახელი..." rows={2}
              className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder-white/25 rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Keywords</label>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="SEO keywords, separated by commas..."
              className="w-full bg-transparent outline-none text-sm text-white placeholder-white/25 rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Tone</label>
            <div className="flex flex-wrap gap-1.5">
              {TONES.map(t => (
                <button key={t} onClick={() => setTone(t)} className="px-2 py-1 rounded-lg text-xs transition-all"
                  style={tone === t ? { background: '#06b6d418', border: '1px solid #06b6d440', color: '#67e8f9' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>{t}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Length</label>
            <div className="space-y-1">
              {LENGTHS.map(l => (
                <button key={l} onClick={() => setLength(l)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={length === l ? { background: '#06b6d418', border: '1px solid #06b6d440', color: '#67e8f9' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>{l}</button>
              ))}
            </div>
          </div>

          <button onClick={generate} disabled={!topic.trim() || loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#06b6d4,#6366f1)' }}>
            {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Writing...</> : <><Wand2 className="w-4 h-4" /> Generate Copy</>}
          </button>
        </div>

        <div className="lg:col-span-2">
          {!result ? (
            <div className="h-full min-h-64 rounded-2xl flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(6,182,212,0.2)' }}>
              <FileText className="w-10 h-10 text-white/15" />
              <p className="text-sm text-white/30">გენერირებული ტექსტი აქ გამოჩნდება</p>
            </div>
          ) : (
            <div className="rounded-2xl p-5 h-full space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Copy Ready</span>
                <button onClick={copy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white transition-all" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy All</>}
                </button>
              </div>
              <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
              <div className="flex gap-2 pt-2">
                <button onClick={generate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white transition-all" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
