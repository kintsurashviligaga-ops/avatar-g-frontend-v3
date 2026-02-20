'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DRAFT_KEY = 'marketplace_listing_draft_v1';

export default function MarketplaceNewListingPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [step, setStep] = useState<WizardStep>(1);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastApiError, setLastApiError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const [form, setForm] = useState({
    status: 'draft' as 'draft' | 'published' | 'archived',
    type: 'digital' as 'digital' | 'service',
    title: '',
    category: 'Digital Goods',
    tags: '',
    description: '',
    faqQ: '',
    faqA: '',
    media: '',
    deliveryMode: 'instant_link',
    deliveryUrl: '',
    turnaround: '',
    currency: 'USD',
    amount: '0',
    isFree: false,
    startingAt: false,
    language: locale,
  });

  useEffect(() => {
    const boot = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));

      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as typeof form;
          setForm((current) => ({ ...current, ...parsed }));
        } catch {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
      setLoading(false);
    };

    void boot();
  }, []);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const onMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    update('media', URL.createObjectURL(file));
  };

  const submit = async (publishNow = false) => {
    if (!authenticated) {
      setError(isEn ? 'Login required to publish listing. Draft is saved locally.' : 'ლისტინგის გამოსაქვეყნებლად საჭიროა ავტორიზაცია. დრაფტი შენახულია ლოკალურად.');
      return;
    }

    setSaving(true);
    setError(null);
    setLastApiError(null);

    try {
      await fetchJson('/api/marketplace/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: publishNow ? 'published' : 'draft',
          type: form.type,
          title: form.title,
          category: form.category,
          tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          description: form.description,
          faq: form.faqQ || form.faqA ? [{ q: form.faqQ, a: form.faqA }] : [],
          media: form.media ? [form.media] : [],
          delivery: {
            mode: form.deliveryMode,
            url: form.deliveryUrl || undefined,
            turnaround: form.turnaround || undefined,
          },
          pricing: {
            currency: form.currency,
            amount: Number(form.amount || 0),
            isFree: form.isFree,
            startingAt: form.startingAt,
            plan: 'fixed',
          },
          language: form.language,
        }),
      });

      localStorage.removeItem(DRAFT_KEY);
      window.location.href = withLocalePath('/services/marketplace/my', locale);
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      setLastApiError(msg);
    } finally {
      setSaving(false);
    }
  };

  const progress = Math.round((step / 7) * 100);

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-5xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-4">
          <h1 className="text-2xl font-semibold text-white">{isEn ? 'Create Listing Wizard' : 'ლისტინგის შექმნის ვიზარდი'}</h1>
          <p className="mt-1 text-sm text-gray-300">{isEn ? 'Step-by-step listing creation for digital goods and services.' : 'ნაბიჯ-ნაბიჯ ლისტინგის შექმნა ციფრული პროდუქტებისთვის და სერვისებისთვის.'}</p>
          <div className="mt-3 h-2 w-full rounded-full bg-white/10"><div className="h-2 rounded-full bg-cyan-400" style={{ width: `${progress}%` }} /></div>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="success">{isEn ? `Step ${step}/7` : `ნაბიჯი ${step}/7`}</Badge>
            {!authenticated && <Badge variant="warning">{isEn ? 'Guest mode' : 'Guest რეჟიმი'}</Badge>}
          </div>
        </Card>

        {!authenticated && (
          <Card className="border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            {isEn ? 'You can prepare a draft now. Login is required to publish.' : 'ახლა შეგიძლია დრაფტის მომზადება. გამოსაქვეყნებლად საჭიროა ავტორიზაცია.'}
            <div className="mt-2"><Link href={`/auth?next=${encodeURIComponent(withLocalePath('/services/marketplace/listings/new', locale))}`} className="text-cyan-300 hover:text-cyan-200">{isEn ? 'Login now' : 'შესვლა'}</Link></div>
          </Card>
        )}

        {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</Card>}

        {loading ? (
          <Card className="h-56 animate-pulse border-white/10 bg-white/5" />
        ) : (
          <Card className="border-white/10 bg-white/5 p-4">
            {step === 1 && (
              <div className="space-y-2">
                <label className="block text-sm text-white">{isEn ? 'Listing type' : 'ლისტინგის ტიპი'}</label>
                <select value={form.type} onChange={(e) => update('type', e.target.value as 'digital' | 'service')} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                  <option value="digital">Digital Product</option>
                  <option value="service">Service Offer</option>
                </select>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2">
                <input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder={isEn ? 'Title' : 'სათაური'} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                <input value={form.category} onChange={(e) => update('category', e.target.value)} placeholder={isEn ? 'Category' : 'კატეგორია'} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                <input value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder={isEn ? 'Tags (comma separated)' : 'ტეგები (მძიმით)'} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2">
                <textarea value={form.description} onChange={(e) => update('description', e.target.value)} placeholder={isEn ? 'Description' : 'აღწერა'} className="h-28 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input value={form.faqQ} onChange={(e) => update('faqQ', e.target.value)} placeholder="FAQ Q" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                  <input value={form.faqA} onChange={(e) => update('faqA', e.target.value)} placeholder="FAQ A" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/20 bg-black/25 px-3 py-4 text-sm text-white">
                  {isEn ? 'Upload image' : 'სურათის ატვირთვა'}
                  <input type="file" accept="image/*" className="hidden" onChange={onMediaChange} />
                </label>
                <input value={form.media} onChange={(e) => update('media', e.target.value)} placeholder={isEn ? 'or media URL' : 'ან media URL'} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </div>
            )}

            {step === 5 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input value={form.currency} onChange={(e) => update('currency', e.target.value)} placeholder="Currency" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                <input value={form.amount} onChange={(e) => update('amount', e.target.value)} placeholder="Amount" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={form.isFree} onChange={(e) => update('isFree', e.target.checked)} /> Free</label>
                <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={form.startingAt} onChange={(e) => update('startingAt', e.target.checked)} /> Starting at</label>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-2">
                <select value={form.deliveryMode} onChange={(e) => update('deliveryMode', e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                  <option value="instant_link">Instant link</option>
                  <option value="manual">Manual delivery</option>
                  <option value="turnaround">Turnaround based</option>
                </select>
                <input value={form.deliveryUrl} onChange={(e) => update('deliveryUrl', e.target.value)} placeholder={isEn ? 'Delivery URL (optional)' : 'მიწოდების URL (არჩევითი)'} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                <input value={form.turnaround} onChange={(e) => update('turnaround', e.target.value)} placeholder={isEn ? 'Turnaround' : 'დრო'} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </div>
            )}

            {step === 7 && (
              <div className="space-y-2 text-sm text-gray-300">
                <p>{isEn ? 'Publish now or save as draft.' : 'გამოაქვეყნე ახლავე ან შეინახე დრაფტად.'}</p>
                <p>{isEn ? 'Type:' : 'ტიპი:'} {form.type}</p>
                <p>{isEn ? 'Title:' : 'სათაური:'} {form.title || '-'}</p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <Button variant="secondary" onClick={() => setStep((current) => Math.max(1, current - 1) as WizardStep)} disabled={step === 1}>{isEn ? 'Back' : 'უკან'}</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void submit(false)} disabled={saving}>
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} {isEn ? 'Save Draft' : 'დრაფტის შენახვა'}
                </Button>
                {step < 7 ? (
                  <Button onClick={() => setStep((current) => Math.min(7, current + 1) as WizardStep)}>{isEn ? 'Next' : 'შემდეგ'}</Button>
                ) : (
                  <Button onClick={() => void submit(true)} disabled={saving}><Sparkles className="mr-1 h-4 w-4" /> {isEn ? 'Publish' : 'გამოქვეყნება'}</Button>
                )}
              </div>
            </div>
          </Card>
        )}

        <Card className="border-white/10 bg-white/5 p-4">
          <button type="button" onClick={() => setShowDiagnostics((current) => !current)} className="text-sm font-semibold text-white">
            {isEn ? 'Diagnostics' : 'დიაგნოსტიკა'}
          </button>
          {showDiagnostics ? (
            <div className="mt-2 space-y-1 text-xs text-gray-300">
              <p>auth: {String(authenticated)}</p>
              <p>last api error: {lastApiError || 'none'}</p>
              <p>media upload: {form.media ? 'attached' : 'empty'}</p>
              <p>step: {step}</p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-400">{isEn ? 'Collapsed by default.' : 'ნაგულისხმევად დახურულია.'}</p>
          )}
        </Card>
      </div>
    </main>
  );
}
