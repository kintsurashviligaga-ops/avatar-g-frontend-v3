'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronRight, Loader2, Upload } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

const STEPS = ['basics', 'pricing', 'media', 'description', 'category', 'shipping', 'review'] as const;
type Step = (typeof STEPS)[number];

const CATEGORIES = ['avatar', 'video', 'music', 'image', 'voice', 'prompt', 'other'];

export default function MarketplaceNewListingPage() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [step, setStep] = useState<Step>('basics');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('GEL');
  const [category, setCategory] = useState('other');
  const [shippingNote, setShippingNote] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');

  const stepIndex = STEPS.indexOf(step);
  const next = () => { if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]!); };
  const prev = () => { if (stepIndex > 0) setStep(STEPS[stepIndex - 1]!); };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await fetchJson('/api/marketplace/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, price: Number(price), currency, category, shipping_note: shippingNote, media_url: mediaUrl }),
      });
      router.push(withLocalePath('/services/marketplace/my', locale));
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-transparent px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={withLocalePath('/services/marketplace', locale)}>
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />{isEn ? 'Back' : 'უკან'}</Button>
          </Link>
          <h1 className="text-xl font-semibold text-white">{isEn ? 'Create Listing' : 'განცხადების შექმნა'}</h1>
        </div>

        <div className="flex flex-wrap gap-1">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`rounded-full px-3 py-1 text-xs ${step === s ? 'bg-cyan-500 text-white' : i < stepIndex ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-gray-400'}`}
            >
              {i < stepIndex ? <Check className="inline h-3 w-3 mr-1" /> : null}{s}
            </button>
          ))}
        </div>

        <Card className="border-white/10 bg-white/5 p-5 space-y-4">
          {step === 'basics' && (
            <>
              <label className="block text-sm text-white">{isEn ? 'Title' : 'სათაური'}
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </label>
            </>
          )}

          {step === 'pricing' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-white">{isEn ? 'Price' : 'ფასი'}
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 block w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </label>
              <label className="block text-sm text-white">{isEn ? 'Currency' : 'ვალუტა'}
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 block w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                  {['GEL', 'USD', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
          )}

          {step === 'media' && (
            <label className="block text-sm text-white">{isEn ? 'Media URL (thumbnail or preview)' : 'მედია URL'}
              <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." className="mt-1 block w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
            </label>
          )}

          {step === 'description' && (
            <label className="block text-sm text-white">{isEn ? 'Description' : 'აღწერა'}
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="mt-1 block w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
            </label>
          )}

          {step === 'category' && (
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-4 py-1.5 text-sm ${category === c ? 'bg-cyan-500 text-white' : 'bg-white/10 text-gray-300'}`}>{c}</button>
              ))}
            </div>
          )}

          {step === 'shipping' && (
            <label className="block text-sm text-white">{isEn ? 'Shipping / Delivery notes' : 'მიტანის პირობები'}
              <textarea value={shippingNote} onChange={(e) => setShippingNote(e.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
            </label>
          )}

          {step === 'review' && (
            <div className="space-y-2 text-sm text-gray-200">
              <p><strong className="text-white">{isEn ? 'Title' : 'სათაური'}:</strong> {title || '-'}</p>
              <p><strong className="text-white">{isEn ? 'Price' : 'ფასი'}:</strong> {price || '0'} {currency}</p>
              <p><strong className="text-white">{isEn ? 'Category' : 'კატეგორია'}:</strong> {category}</p>
              <p><strong className="text-white">{isEn ? 'Description' : 'აღწერა'}:</strong> {description || '-'}</p>
            </div>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={prev} disabled={stepIndex === 0}>{isEn ? 'Back' : 'უკან'}</Button>
            {step === 'review' ? (
              <Button onClick={() => void submit()} disabled={saving || !title.trim()}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}{isEn ? 'Publish' : 'გამოქვეყნება'}
              </Button>
            ) : (
              <Button onClick={next}><ChevronRight className="mr-1 h-4 w-4" />{isEn ? 'Next' : 'შემდეგი'}</Button>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
