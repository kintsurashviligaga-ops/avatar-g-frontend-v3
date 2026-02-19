'use client';

import { useEffect, useState } from 'react';

interface StoreOption {
  id: string;
  shop_name: string;
}

interface LaunchClientProps {
  stores: StoreOption[];
}

interface LaunchWeek {
  week: number;
  focus: string;
  actions: string[];
}

interface LaunchPlanData {
  weeks?: LaunchWeek[];
  founders_program?: {
    goal?: string;
    incentives?: string[];
  };
  influencer_outreach_templates?: string[];
}

export default function LaunchClient({ stores }: LaunchClientProps) {
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [language, setLanguage] = useState('en');
  const [plan, setPlan] = useState<LaunchPlanData | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadPlan() {
      if (!storeId) return;
      const response = await fetch(`/api/launch/plan?storeId=${storeId}`);
      const data = (await response.json()) as { data?: { plan_json?: LaunchPlanData } };
      if (data.data) {
        setPlan(data.data.plan_json || null);
      }
    }

    loadPlan();
  }, [storeId]);

  async function generatePlan() {
    setLoading(true);
    try {
      const response = await fetch('/api/launch/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, language }),
      });
      const data = (await response.json()) as { data?: { plan_json?: LaunchPlanData }; markdown?: string };
      if (response.ok) {
        setPlan(data.data?.plan_json || null);
        setMarkdown(data.markdown || '');
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyMarkdown() {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Georgia Launch Plan</h1>
          <p className="text-gray-400">90-day go-to-market strategy inside your dashboard.</p>
        </div>
        <button
          onClick={generatePlan}
          className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded"
        >
          {loading ? 'Generating...' : 'Generate Plan'}
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-gray-300">Store</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{store.shop_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-300">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
            >
              <option value="en">English</option>
              <option value="ka">Georgian</option>
              <option value="ru">Russian</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={copyMarkdown}
              className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 rounded"
            >
              Copy Markdown
            </button>
          </div>
        </div>
      </div>

      {plan && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">90-Day Plan</h2>
            <div className="space-y-4">
              {plan.weeks?.map((week) => (
                <div key={week.week} className="bg-black/30 rounded p-4">
                  <h3 className="font-semibold">Week {week.week}: {week.focus}</h3>
                  <ul className="list-disc list-inside text-sm text-gray-300 mt-2">
                    {week.actions?.map((action: string, idx: number) => (
                      <li key={idx}>{action}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Founder Program</h2>
            <p className="text-sm text-gray-300">{plan.founders_program?.goal}</p>
            <ul className="list-disc list-inside text-sm text-gray-300 mt-2">
              {plan.founders_program?.incentives?.map((i: string, idx: number) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
            <h3 className="text-lg font-semibold mt-6">Influencer Templates</h3>
            <ul className="list-disc list-inside text-sm text-gray-300 mt-2">
              {plan.influencer_outreach_templates?.map((t: string, idx: number) => (
                <li key={idx}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {markdown && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Markdown Export</h2>
          <textarea
            value={markdown}
            readOnly
            className="w-full h-64 bg-black/40 border border-white/10 rounded p-3 text-sm"
          />
        </div>
      )}
    </div>
  );
}
