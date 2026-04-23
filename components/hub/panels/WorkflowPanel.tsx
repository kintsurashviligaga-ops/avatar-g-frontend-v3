'use client';

/**
 * WorkflowPanel — Visual pipeline builder
 * Pre-built templates + drag-and-drop (mock) service chain builder
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Plus, Trash2, ChevronRight, Zap, CheckCircle2,
  Clock, Loader2, ArrowRight, Sparkles, GripVertical,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { beginPanelShellRun, createTextPreview } from './panelShellBridge';
import type { PanelRunCallbacks } from '@/types/dashboard';

// ─── Types ───────────────────────────────────────────────────

type StepStatus = 'idle' | 'running' | 'done' | 'error';

type PipelineStep = {
  id: string;
  serviceId: string;
  label: string;
  emoji: string;
  color: string;
  status: StepStatus;
  output?: string;
};

type Template = {
  id: string;
  icon: string;
  name: string;
  desc: string;
  services: string[];
  accent: string;
  steps: Omit<PipelineStep, 'id' | 'status'>[];
};

// ─── Templates ───────────────────────────────────────────────

const TEMPLATES: Template[] = [
  {
    id: 'brand-video',
    icon: '🎬',
    name: 'Brand Video',
    desc: 'Avatar → Script → Video → Export',
    services: ['avatar', 'text', 'video'],
    accent: 'from-sky-500/10 to-blue-600/5 border-sky-400/20',
    steps: [
      { serviceId: 'avatar', label: 'Generate Avatar',   emoji: '👤', color: 'text-violet-300' },
      { serviceId: 'text',   label: 'Write Script',      emoji: '✍️', color: 'text-lime-300'   },
      { serviceId: 'video',  label: 'Produce Video',     emoji: '🎬', color: 'text-sky-300'    },
    ],
  },
  {
    id: 'tiktok-factory',
    icon: '📱',
    name: 'TikTok Factory',
    desc: 'Image → Music → Short Video',
    services: ['image', 'music', 'video'],
    accent: 'from-pink-500/10 to-rose-600/5 border-pink-400/20',
    steps: [
      { serviceId: 'image',  label: 'Generate Thumbnail', emoji: '🖼️', color: 'text-teal-300'  },
      { serviceId: 'music',  label: 'Compose Track',       emoji: '🎵', color: 'text-pink-300'  },
      { serviceId: 'video',  label: 'Create Short Video',  emoji: '📱', color: 'text-sky-300'   },
    ],
  },
  {
    id: 'ad-campaign',
    icon: '📣',
    name: 'Ad Campaign',
    desc: 'Copy → Visual → Distribution',
    services: ['text', 'image', 'media'],
    accent: 'from-amber-500/10 to-orange-600/5 border-amber-400/20',
    steps: [
      { serviceId: 'text',   label: 'Write Ad Copy',    emoji: '✍️', color: 'text-lime-300'   },
      { serviceId: 'image',  label: 'Create Visual',    emoji: '🖼️', color: 'text-teal-300'   },
      { serviceId: 'media',  label: 'Distribute Assets',emoji: '📡', color: 'text-red-300'    },
    ],
  },
  {
    id: 'avatar-intro',
    icon: '🎭',
    name: 'Avatar Intro',
    desc: 'Avatar → Voice → Animation',
    services: ['avatar', 'text', 'video'],
    accent: 'from-violet-500/10 to-purple-600/5 border-violet-400/20',
    steps: [
      { serviceId: 'avatar', label: 'Build Avatar',     emoji: '🧑‍🎨', color: 'text-violet-300' },
      { serviceId: 'text',   label: 'Write Intro Text', emoji: '✍️',  color: 'text-lime-300'   },
      { serviceId: 'video',  label: 'Animate Intro',    emoji: '🎬',  color: 'text-sky-300'    },
    ],
  },
];

const ALL_SERVICES = [
  { id: 'avatar',  emoji: '👤', label: 'Avatar',   color: 'text-violet-300' },
  { id: 'video',   emoji: '🎬', label: 'Video',    color: 'text-sky-300'   },
  { id: 'image',   emoji: '🖼️', label: 'Image',    color: 'text-teal-300'  },
  { id: 'music',   emoji: '🎵', label: 'Music',    color: 'text-pink-300'  },
  { id: 'text',    emoji: '✍️', label: 'Copy',     color: 'text-lime-300'  },
  { id: 'audio',   emoji: '🎙️', label: 'Voice',    color: 'text-amber-300' },
  { id: 'editing', emoji: '✂️', label: 'Editing',  color: 'text-orange-300'},
  { id: 'prompt',  emoji: '💡', label: 'Prompt',   color: 'text-yellow-300'},
];

// ─── Component ───────────────────────────────────────────────

export function WorkflowPanel({ locale, callbacks }: { locale: string; callbacks?: PanelRunCallbacks }) {
  const [steps,    setSteps]    = useState<PipelineStep[]>([]);
  const [running,  setRunning]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const loadTemplate = (tpl: Template) => {
    setDone(false);
    setSteps(tpl.steps.map(s => ({ ...s, id: Math.random().toString(36).slice(2), status: 'idle' })));
  };

  const addStep = (svc: typeof ALL_SERVICES[0]) => {
    setSteps(prev => [
      ...prev,
      { id: Math.random().toString(36).slice(2), serviceId: svc.id, label: svc.label, emoji: svc.emoji, color: svc.color, status: 'idle' },
    ]);
  };

  const removeStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));

  const runPipeline = async () => {
    if (steps.length === 0) return;

    const shellRun = beginPanelShellRun(callbacks, 'workflow', 'Pipeline Builder', 8);
    setRunning(true);
    setDone(false);
    try {
      for (let i = 0; i < steps.length; i++) {
        setSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'running' } : s));
        shellRun.progress(((i + 1) / (steps.length + 1)) * 100);
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
        setSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'done', output: `Output from ${s.label} ready` } : s));
      }

      const detail = `${steps.length} workflow steps completed`;
      const outputText = steps.map((step, index) => `${index + 1}. ${step.label}`).join('\n');
      shellRun.complete(detail, createTextPreview('Pipeline Builder', detail, outputText));
      setDone(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow execution failed';
      shellRun.fail(message);
    } finally {
      setRunning(false);
    }
  };

  const reset = () => { setSteps([]); setDone(false); setRunning(false); };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg">
            <span className="text-lg">⚡</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Pipeline Builder</h1>
            <p className="text-[12px] text-white/40">Chain services into automated AI pipelines</p>
          </div>
          {(steps.length > 0 || done) && (
            <button onClick={reset} className="ml-auto text-[12px] text-white/35 hover:text-white/60 transition-colors">
              Reset
            </button>
          )}
        </div>

        {/* Templates */}
        <div>
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">Quick-Start Templates</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => loadTemplate(t)}
                className={cn('flex flex-col items-start gap-2 p-3 rounded-2xl border bg-gradient-to-br text-left hover:scale-[1.02] transition-all', t.accent)}>
                <span className="text-xl">{t.icon}</span>
                <div>
                  <p className="text-[12px] font-bold text-white/90">{t.name}</p>
                  <p className="text-[10px] text-white/40 mt-0.5">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_240px] gap-5">

          {/* Pipeline canvas */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Your Pipeline</p>
              {steps.length > 0 && (
                <p className="text-[11px] text-white/30">{steps.length} step{steps.length !== 1 ? 's' : ''}</p>
              )}
            </div>

            {steps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 rounded-2xl border-2 border-dashed border-white/[0.08] text-white/20">
                <Zap size={32} className="mb-3" />
                <p className="text-[13px] font-medium">No steps yet</p>
                <p className="text-[11px] mt-1">Choose a template or add services →</p>
              </div>
            ) : (
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <div key={step.id}>
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all',
                        step.status === 'running' ? 'border-amber-400/30 bg-amber-400/[0.06] shadow-[0_0_16px_rgba(245,158,11,0.1)]' :
                        step.status === 'done'    ? 'border-emerald-400/25 bg-emerald-400/[0.05]' :
                                                    'border-white/[0.07] bg-white/[0.02]',
                      )}
                    >
                      <GripVertical size={13} className="text-white/20 cursor-grab shrink-0" />
                      <div className="w-7 h-7 rounded-xl border border-white/[0.10] bg-white/[0.04] flex items-center justify-center text-[12px] shrink-0">
                        {step.status === 'running' ? <Loader2 size={12} className="animate-spin text-amber-300" /> :
                         step.status === 'done'    ? <CheckCircle2 size={12} className="text-emerald-400" /> :
                         step.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-white/80">{step.label}</span>
                          <span className="text-[10px] text-white/30">Step {i + 1}</span>
                        </div>
                        {step.output && step.status === 'done' && (
                          <p className="text-[10px] text-emerald-400/80 mt-0.5 truncate">{step.output}</p>
                        )}
                      </div>
                      {!running && step.status === 'idle' && (
                        <button onClick={() => removeStep(step.id)} className="text-white/20 hover:text-rose-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </motion.div>
                    {i < steps.length - 1 && (
                      <div className="flex justify-center py-1">
                        <ChevronRight size={14} className="text-white/20 rotate-90" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Run button */}
            {steps.length > 0 && (
              <div className="mt-4 space-y-2">
                {done && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300">
                    <CheckCircle2 size={14} className="shrink-0" />
                    <p className="text-[12px] font-semibold">Pipeline complete! All {steps.length} steps finished.</p>
                  </motion.div>
                )}
                <button onClick={runPipeline} disabled={running}
                  className={cn('w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[14px] font-bold transition-all',
                    running
                      ? 'bg-white/[0.05] border border-white/[0.08] text-white/25 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_0_24px_rgba(249,115,22,0.4)] hover:shadow-[0_0_32px_rgba(249,115,22,0.55)] hover:scale-[1.01]')}>
                  {running ? (<><Loader2 size={16} className="animate-spin" />Running pipeline…</>) : done
                    ? (<><Sparkles size={16} />Run Again</>) : (<><Play size={16} />Run Pipeline</>)}
                </button>
              </div>
            )}
          </div>

          {/* Service pickers */}
          <div>
            <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">Add Service</p>
            <div className="space-y-1.5">
              {ALL_SERVICES.map(svc => (
                <button key={svc.id} onClick={() => addStep(svc)} disabled={running}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] text-white/50 hover:text-white/80 hover:bg-white/[0.06] hover:border-white/[0.14] transition-all disabled:opacity-30 text-[12px] font-medium">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm', svc.color)}>{svc.emoji}</span>
                    <span>{svc.label}</span>
                  </div>
                  <Plus size={12} className="text-white/25" />
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <Link href={`/${locale}/services/workflow`}
                className="flex items-center justify-center gap-1.5 text-[12px] text-cyan-400 hover:text-cyan-300 transition-colors">
                Full Builder <ArrowRight size={11} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
