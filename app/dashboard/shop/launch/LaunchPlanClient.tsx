/**
 * Launch Plan Dashboard - Client Component
 */
'use client';

import { useState } from 'react';

interface LaunchPlan {
  id: string;
  weeks: Array<{ week: number; title: string; tasks: string[] }>;
  checklist: Array<{ item: string; completed: boolean }>;
  socialTemplates: string[];
  influencerScripts: string[];
}

export default function LaunchPlanClient({ storeId }: { storeId: string }) {
  const [plan, setPlan] = useState<LaunchPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGeneratePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/launch/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          language: 'en',
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      setPlan(data.data.plan);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-6">90-Day Launch Plan</h2>

        <button
          onClick={handleGeneratePlan}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-6 py-2 rounded font-medium"
        >
          {loading ? 'Generating...' : 'Generate 90-Day Plan'}
        </button>

        {error && <div className="mt-4 bg-red-900 border border-red-700 rounded p-3 text-red-100">{error}</div>}
      </div>

      {plan && (
        <div className="space-y-6">
          {/* Checklist */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4">Launch Checklist</h3>
            <div className="space-y-2">
              {plan.checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-2 bg-gray-700 rounded">
                  <div className="w-5 h-5 rounded border-2 border-gray-500" />
                  <span>{item.item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Tasks */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4">Week-by-Week Tasks (First 4 weeks)</h3>
            <div className="space-y-3">
              {plan.weeks.slice(0, 4).map((week) => (
                <div key={week.week} className="bg-gray-700 rounded p-3">
                  <div className="font-semibold mb-2">{week.title}</div>
                  <ul className="list-disc list-inside text-sm text-gray-300">
                    {week.tasks.map((task, i) => (
                      <li key={i}>{task}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Social Templates */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4">Social Media Templates</h3>
            <div className="space-y-2">
              {plan.socialTemplates.map((template, i) => (
                <div key={i} className="bg-gray-700 rounded p-3 text-sm">
                  {template}
                </div>
              ))}
            </div>
          </div>

          {/* Influencer Scripts */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4">Influencer DM Scripts</h3>
            <div className="space-y-2">
              {plan.influencerScripts.map((script, i) => (
                <div key={i} className="bg-gray-700 rounded p-3 text-sm">
                  {script}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
