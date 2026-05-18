'use client';

import { useState } from 'react';
import { Workflow, Zap, Play, Pause, CheckCircle, Clock, Plus, ChevronRight, Bot, ImageIcon, FileText, Video } from 'lucide-react';

const TEMPLATES = [
  {
    id: 'content-pipeline',
    name: 'Content Pipeline',
    desc: 'Agent G → Copy AI → Image Gen → Social post',
    steps: ['Agent G', 'Copy AI', 'Image Gen'],
    color: '#6366f1',
    credits: 55,
  },
  {
    id: 'tiktok-factory',
    name: 'TikTok Factory',
    desc: 'Script → Voiceover → Video → Caption',
    steps: ['Script', 'Voice', 'Video Edit'],
    color: '#ef4444',
    credits: 80,
  },
  {
    id: 'brand-kit',
    name: 'Brand Kit Generator',
    desc: 'Logo concept → Avatar → Copy → Color palette',
    steps: ['Image Gen', 'Avatar', 'Copy AI'],
    color: '#f59e0b',
    credits: 65,
  },
  {
    id: 'seo-blog',
    name: 'SEO Blog Machine',
    desc: 'Keyword → Outline → Full post → Meta tags',
    steps: ['Research', 'Outline', 'Copy AI'],
    color: '#10b981',
    credits: 30,
  },
];

const ACTIVE = [
  { name: 'Content Pipeline', status: 'running', step: 2, total: 3, started: '5 წ. წინ', color: '#6366f1' },
  { name: 'SEO Blog Machine', status: 'done', step: 3, total: 3, started: '1 სთ. წინ', color: '#10b981' },
  { name: 'Brand Kit Generator', status: 'paused', step: 1, total: 3, started: 'გუშინ', color: '#f59e0b' },
];

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  'Agent G': Bot,
  'Copy AI': FileText,
  'Image Gen': ImageIcon,
  'Script': FileText,
  'Video Edit': Video,
  'Research': Bot,
  'Outline': FileText,
  'Avatar': Bot,
  'Voice': Bot,
};

export default function WorkflowsPage() {
  const [activeTab, setActiveTab] = useState<'templates' | 'active'>('templates');
  const [running, setRunning] = useState<string[]>([]);

  const launch = (id: string) => setRunning(prev => [...prev, id]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#84cc1618', border: '1px solid #84cc1640' }}>
            <Workflow className="w-5 h-5" style={{ color: '#84cc16' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Workflow Builder</h1>
            <p className="text-xs text-white/40">ბიზნეს პროცესების ავტომატიზაცია</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
          style={{ background: 'rgba(132,204,22,0.15)', border: '1px solid rgba(132,204,22,0.3)', color: '#bef264' }}>
          <Plus className="w-4 h-4" /> New Workflow
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl p-1 w-fit" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {(['templates', 'active'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all"
            style={activeTab === tab ? { background: 'rgba(255,255,255,0.1)', color: '#fff' } : { color: 'rgba(255,255,255,0.45)' }}>
            {tab === 'active' ? 'Active Runs' : 'Templates'}
          </button>
        ))}
      </div>

      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TEMPLATES.map(tmpl => {
            const isRunning = running.includes(tmpl.id);
            return (
              <div key={tmpl.id} className="rounded-2xl p-5 space-y-4 transition-all hover:scale-[1.01]"
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isRunning ? tmpl.color + '40' : 'rgba(255,255,255,0.07)'}` }}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{tmpl.name}</h3>
                    <p className="text-xs text-white/40 mt-0.5">{tmpl.desc}</p>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px]" style={{ background: `${tmpl.color}15`, color: tmpl.color }}>
                    <Zap className="w-2.5 h-2.5" /> {tmpl.credits}cr
                  </div>
                </div>

                {/* Pipeline visualization */}
                <div className="flex items-center gap-2">
                  {tmpl.steps.map((step, i) => {
                    const Icon = STEP_ICONS[step] ?? Bot;
                    return (
                      <div key={step} className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${tmpl.color}15`, border: `1px solid ${tmpl.color}30` }}>
                          <Icon className="w-4 h-4" style={{ color: tmpl.color }} />
                        </div>
                        {i < tmpl.steps.length - 1 && <ChevronRight className="w-3 h-3 text-white/25" />}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => launch(tmpl.id)}
                  disabled={isRunning}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-70"
                  style={{ background: isRunning ? `${tmpl.color}20` : `${tmpl.color}22`, border: `1px solid ${tmpl.color}40`, color: tmpl.color }}
                >
                  {isRunning ? <><div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> Running...</> : <><Play className="w-3.5 h-3.5" /> Launch</>}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'active' && (
        <div className="space-y-3">
          {ACTIVE.map((run, i) => (
            <div key={i} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{
                    background: run.status === 'running' ? '#10b981' : run.status === 'done' ? '#3b82f6' : '#f59e0b',
                    boxShadow: run.status === 'running' ? '0 0 8px #10b981' : 'none',
                  }} />
                  <div>
                    <p className="text-sm font-semibold text-white">{run.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3 text-white/25" />
                      <span className="text-[11px] text-white/35">Started {run.started}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {run.status === 'done' && <CheckCircle className="w-4 h-4 text-blue-400" />}
                  {run.status === 'running' && (
                    <button className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-400/10 transition-colors">
                      <Pause className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {run.status === 'paused' && (
                    <button className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors">
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/40">Step {run.step} of {run.total}</span>
                  <span className="text-white/40">{Math.round((run.step / run.total) * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${(run.step / run.total) * 100}%`, background: run.color,
                      boxShadow: run.status === 'running' ? `0 0 8px ${run.color}` : 'none' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
