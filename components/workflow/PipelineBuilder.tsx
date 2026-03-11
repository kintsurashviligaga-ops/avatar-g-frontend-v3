'use client';

import { useState, useCallback, useMemo } from 'react';
import { useLanguage } from '@/lib/i18n/useLanguage';
import {
  PIPELINE_SERVICES,
  PIPELINE_SERVICES_MAP,
  PIPELINE_TEMPLATES,
  type PipelineServiceDef,
} from '@/lib/workflows/pipeline-services';
import {
  type PipelineStep,
  type BuilderMode,
  type PipelineRunState,
  toWorkflowSteps,
  newStepId,
} from './types';
import PipelineCanvas from './PipelineCanvas';
import StepConfigurator from './StepConfigurator';
import PipelineExecutionView from './PipelineExecutionView';

/* ─── i18n labels ──────────────────────────────────────────────────────── */
const L = {
  en: {
    title: 'Pipeline Command Centre',
    subtitle: 'Build end-to-end automation pipelines with AI agents',
    templateTitle: 'Start from a Template',
    templateDesc: 'Choose a proven pipeline or build from scratch',
    scratchTitle: 'Build from Scratch',
    scratchDesc: 'Add services one by one',
    services: 'Services',
    searchPlaceholder: 'Search services…',
    pipelineName: 'Pipeline Name',
    pipelineNamePlaceholder: 'My pipeline…',
    clear: 'Clear',
    saveDraft: 'Save Draft',
    saving: 'Saving…',
    execute: 'Execute Pipeline',
    executing: 'Running…',
    addFirst: 'Add a service to start building your pipeline',
    backToBuilder: '← Back to Builder',
    stepCount: 'steps',
    saved: 'Saved',
    emptyCanvas: 'Drag a service from the left panel or choose a template above',
    allCategories: 'All',
  },
  ka: {
    title: 'Pipeline მმართველი ცენტრი',
    subtitle: 'ავტომატიზაციის პაიპლაინების აგება AI აგენტებით',
    templateTitle: 'შაბლონით დაწყება',
    templateDesc: 'აირჩიე დამტკიცებული პაიპლაინი ან ააგე ნულიდან',
    scratchTitle: 'თავიდან აგება',
    scratchDesc: 'სერვისების თანმიმდევრული დამატება',
    services: 'სერვისები',
    searchPlaceholder: 'სერვისების ძებნა…',
    pipelineName: 'პაიპლაინის სახელი',
    pipelineNamePlaceholder: 'ჩემი პაიპლაინი…',
    clear: 'გასუფთავება',
    saveDraft: 'დრაფტის შენახვა',
    saving: 'ინახება…',
    execute: 'პაიპლაინის გაშვება',
    executing: 'მიმდინარეობს…',
    addFirst: 'დაამატე სერვისი პაიპლაინის ასაგებად',
    backToBuilder: '← ბილდერზე დაბრუნება',
    stepCount: 'ნაბიჯი',
    saved: 'შენახულია',
    emptyCanvas: 'გადმოათრიე სერვისი მარცხენა პანელიდან ან აირჩიე შაბლონი ზემოდან',
    allCategories: 'ყველა',
  },
  ru: {
    title: 'Командный центр пайплайнов',
    subtitle: 'Создавайте сквозные пайплайны автоматизации с AI-агентами',
    templateTitle: 'Начать с шаблона',
    templateDesc: 'Выберите готовый пайплайн или создайте с нуля',
    scratchTitle: 'Создать с нуля',
    scratchDesc: 'Добавляйте сервисы по одному',
    services: 'Сервисы',
    searchPlaceholder: 'Поиск сервисов…',
    pipelineName: 'Название пайплайна',
    pipelineNamePlaceholder: 'Мой пайплайн…',
    clear: 'Очистить',
    saveDraft: 'Сохранить черновик',
    saving: 'Сохранение…',
    execute: 'Запустить пайплайн',
    executing: 'Выполняется…',
    addFirst: 'Добавьте сервис для построения',
    backToBuilder: '← Назад к билдеру',
    stepCount: 'шагов',
    saved: 'Сохранено',
    emptyCanvas: 'Перетащите сервис из панели слева или выберите шаблон выше',
    allCategories: 'Все',
  },
};

const CATEGORIES = [
  { key: 'all', en: 'All', ka: 'ყველა', ru: 'Все' },
  { key: 'create', en: 'Create', ka: 'შექმნა', ru: 'Создание' },
  { key: 'edit', en: 'Edit', ka: 'რედაქტირება', ru: 'Редактирование' },
  { key: 'analyze', en: 'Analyze', ka: 'ანალიზი', ru: 'Анализ' },
  { key: 'scale', en: 'Scale', ka: 'მასშტაბი', ru: 'Масштаб' },
];

/* ─── Main Component ──────────────────────────────────────────────────── */

interface PipelineBuilderProps {
  locale: string;
  isAuthenticated: boolean;
  demoMode?: boolean;
}

export default function PipelineBuilder({
  locale,
  isAuthenticated,
  demoMode = false,
}: PipelineBuilderProps) {
  const { language } = useLanguage();
  const lang = (language || locale || 'en') as 'en' | 'ka' | 'ru';
  const t = L[lang] ?? L.en;

  /* ── Pipeline state ─────────────────────────────────────────────── */
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [pipelineName, setPipelineName] = useState('');
  const [mode, setMode] = useState<BuilderMode>('gallery');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [runState, setRunState] = useState<PipelineRunState | null>(null);

  /* ── Service palette state ──────────────────────────────────────── */
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredServices = useMemo(() => {
    let list = PIPELINE_SERVICES;
    if (activeCategory !== 'all') {
      list = list.filter((s) => s.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.shortName.toLowerCase().includes(q) ||
          (s.name[lang] || s.name.en || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeCategory, searchQuery, lang]);

  /* ── Handlers ───────────────────────────────────────────────────── */

  const addStep = useCallback(
    (serviceId: string) => {
      const svc = PIPELINE_SERVICES_MAP.get(serviceId);
      if (!svc) return;
      const step: PipelineStep = {
        id: newStepId(),
        serviceId,
        prompt: svc.defaultPrompt,
        parameters: Object.fromEntries(
          svc.parameterPresets.map((p) => [p.key, p.defaultValue])
        ),
        retryPolicy: { maxRetries: 1, backoffMs: 2000 },
      };
      setSteps((prev) => [...prev, step]);
      setSelectedIdx(steps.length);
      if (mode === 'gallery') setMode('build');
    },
    [steps.length, mode]
  );

  const removeStep = useCallback(
    (idx: number) => {
      setSteps((prev) => prev.filter((_, i) => i !== idx));
      if (selectedIdx === idx) setSelectedIdx(null);
      else if (selectedIdx !== null && selectedIdx > idx)
        setSelectedIdx(selectedIdx - 1);
    },
    [selectedIdx]
  );

  const moveStep = useCallback(
    (from: number, to: number) => {
      setSteps((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        if (moved) next.splice(to, 0, moved);
        return next;
      });
      if (selectedIdx === from) setSelectedIdx(to);
    },
    [selectedIdx]
  );

  const updateStep = useCallback(
    (idx: number, patch: Partial<PipelineStep>) => {
      setSteps((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, ...patch } : s))
      );
    },
    []
  );

  const duplicateStep = useCallback(
    (idx: number) => {
      setSteps((prev) => {
        const source = prev[idx];
        if (!source) return prev;
        const copy: PipelineStep = {
          id: newStepId(),
          serviceId: source.serviceId,
          prompt: source.prompt,
          parameters: { ...source.parameters },
          retryPolicy: { ...source.retryPolicy },
        };
        const next = [...prev];
        next.splice(idx + 1, 0, copy);
        return next;
      });
    },
    []
  );

  const loadTemplate = useCallback(
    (templateId: string) => {
      const tmpl = PIPELINE_TEMPLATES.find((t) => t.id === templateId);
      if (!tmpl) return;
      const newSteps: PipelineStep[] = tmpl.steps.map((ts) => {
        const svc = PIPELINE_SERVICES_MAP.get(ts.serviceId);
        return {
          id: newStepId(),
          serviceId: ts.serviceId,
          prompt: ts.prompt,
          parameters: svc
            ? Object.fromEntries(
                svc.parameterPresets.map((p) => [p.key, p.defaultValue])
              )
            : {},
          retryPolicy: { maxRetries: 1, backoffMs: 2000 },
        };
      });
      setSteps(newSteps);
      setPipelineName((tmpl.name[lang] ?? tmpl.name.en) || '');
      setSelectedIdx(null);
      setMode('build');
      setSavedId(null);
    },
    [lang]
  );

  const clearPipeline = useCallback(() => {
    setSteps([]);
    setSelectedIdx(null);
    setPipelineName('');
    setMode('gallery');
    setSavedId(null);
    setRunState(null);
  }, []);

  /* ── Save draft ─────────────────────────────────────────────────── */
  const saveDraft = useCallback(async () => {
    if (steps.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const workflowSteps = toWorkflowSteps(steps);
      const payload = {
        name: pipelineName || 'Untitled Pipeline',
        status: 'draft' as const,
        steps: workflowSteps,
      };

      const url = savedId
        ? `/api/app/workflows/${encodeURIComponent(savedId)}`
        : '/api/app/workflows';
      const method = savedId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      if (data.workflow?.id) setSavedId(data.workflow.id);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  }, [steps, pipelineName, savedId, isSaving]);

  /* ── Execute ────────────────────────────────────────────────────── */
  const executePipeline = useCallback(async () => {
    if (steps.length === 0) return;

    // Save first if not saved
    let workflowId = savedId;
    if (!workflowId) {
      setIsSaving(true);
      try {
        const workflowSteps = toWorkflowSteps(steps);
        const res = await fetch('/api/app/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: pipelineName || 'Untitled Pipeline',
            status: 'active',
            steps: workflowSteps,
          }),
        });
        if (!res.ok) throw new Error('Save failed');
        const data = await res.json();
        workflowId = data.workflow?.id;
        if (workflowId) setSavedId(workflowId);
      } finally {
        setIsSaving(false);
      }
    }

    if (!workflowId) return;

    // Start run
    const triggerInput: Record<string, string> = {
      prompt: steps[0]?.prompt ?? '',
    };

    const res = await fetch(
      `/api/app/workflows/${encodeURIComponent(workflowId)}/run`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerInput }),
      }
    );

    if (!res.ok) return;
    const data = await res.json();
    const run = data.run;

    setRunState({
      runId: run.id,
      workflowId: workflowId,
      status: run.status ?? 'queued',
      steps: steps.map((s) => ({ stepId: s.id, status: 'queued' as const })),
      logs: run.logs ?? [],
    });
    setMode('run');
  }, [steps, savedId, pipelineName]);

  /* ── Render ─────────────────────────────────────────────────────── */

  // Execution view
  if (mode === 'run' && runState) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
        <header
          className="flex items-center gap-3 px-6 py-4 border-b"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--card-bg)' }}
        >
          <button
            onClick={() => setMode('build')}
            className="text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--color-accent)' }}
          >
            {t.backToBuilder}
          </button>
          <div className="flex-1" />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {pipelineName || 'Untitled Pipeline'}
          </span>
        </header>
        <div className="flex-1 overflow-auto">
          <PipelineExecutionView
            steps={steps}
            runState={runState}
            lang={lang}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header
        className="flex items-center gap-4 px-6 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--card-bg)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            ⬡
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate" style={{ color: 'var(--color-text)' }}>
              {t.title}
            </h1>
            <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.subtitle}
            </p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Pipeline name input */}
        {mode === 'build' && (
          <div className="flex items-center gap-2">
            <input
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
              placeholder={t.pipelineNamePlaceholder}
              className="px-3 py-1.5 rounded-lg text-sm border outline-none transition-colors"
              style={{
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>
        )}

        {/* Action buttons */}
        {mode === 'build' && steps.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={clearPipeline}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:opacity-80"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.clear}
            </button>
            <button
              onClick={saveDraft}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-lg text-xs font-medium border transition-all hover:opacity-80"
              style={{
                borderColor: justSaved ? 'var(--color-accent)' : 'var(--color-border)',
                color: justSaved ? 'var(--color-accent)' : 'var(--color-text)',
              }}
            >
              {isSaving ? t.saving : justSaved ? `✓ ${t.saved}` : t.saveDraft}
            </button>
            {(isAuthenticated || demoMode) && (
              <button
                onClick={executePipeline}
                className="px-5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: '#fff',
                }}
              >
                {t.execute} →
              </button>
            )}
          </div>
        )}
      </header>

      {/* ── Template Gallery (shown when empty) ─────────────────── */}
      {mode === 'gallery' && steps.length === 0 && (
        <TemplateGallery lang={lang} t={t} onSelect={loadTemplate} onScratch={() => setMode('build')} />
      )}

      {/* ── Builder Layout ──────────────────────────────────────── */}
      {(mode === 'build' || steps.length > 0) && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left: Service Palette */}
          <aside
            className="w-56 shrink-0 border-r flex flex-col overflow-hidden"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--card-bg)' }}
          >
            <div className="px-3 pt-3 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.services}
              </h3>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full px-2.5 py-1.5 rounded-md text-xs border outline-none"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
            </div>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-1 px-3 pb-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                  style={{
                    backgroundColor:
                      activeCategory === cat.key ? 'var(--color-accent)' : 'transparent',
                    color:
                      activeCategory === cat.key ? '#fff' : 'var(--color-text-tertiary)',
                  }}
                >
                  {cat[lang as keyof typeof cat] ?? cat.en}
                </button>
              ))}
            </div>

            {/* Service list */}
            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
              {filteredServices.map((svc) => (
                <ServiceCard key={svc.id} service={svc} lang={lang} onAdd={addStep} />
              ))}
            </div>
          </aside>

          {/* Center: Pipeline Canvas */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {steps.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3 max-w-sm">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-2xl"
                    style={{
                      backgroundColor: 'var(--card-bg)',
                      border: '2px dashed var(--color-border)',
                    }}
                  >
                    +
                  </div>
                  <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.emptyCanvas}
                  </p>
                </div>
              </div>
            ) : (
              <PipelineCanvas
                steps={steps}
                selectedIdx={selectedIdx}
                lang={lang}
                onSelect={setSelectedIdx}
                onRemove={removeStep}
                onMove={moveStep}
                onAddAfter={(_idx: number) => {
                  // Show palette highlight - for now just select nothing
                  setSelectedIdx(null);
                }}
              />
            )}
          </main>

          {/* Right: Step Configurator */}
          {selectedIdx !== null && selectedIdx < steps.length && (() => {
            const selectedStep = steps[selectedIdx];
            if (!selectedStep) return null;
            return (
            <aside
              className="w-80 shrink-0 border-l flex flex-col overflow-hidden"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--card-bg)' }}
            >
              <StepConfigurator
                step={selectedStep}
                stepIndex={selectedIdx}
                totalSteps={steps.length}
                lang={lang}
                onUpdate={(patch: Partial<PipelineStep>) => updateStep(selectedIdx, patch)}
                onRemove={() => removeStep(selectedIdx)}
                onDuplicate={() => duplicateStep(selectedIdx)}
                onMoveUp={selectedIdx > 0 ? () => moveStep(selectedIdx, selectedIdx - 1) : undefined}
                onMoveDown={
                  selectedIdx < steps.length - 1
                    ? () => moveStep(selectedIdx, selectedIdx + 1)
                    : undefined
                }
                onClose={() => setSelectedIdx(null)}
              />
            </aside>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ─── Template Gallery ─────────────────────────────────────────────────── */

function TemplateGallery({
  lang,
  t,
  onSelect,
  onScratch,
}: {
  lang: 'en' | 'ka' | 'ru';
  t: (typeof L)['en'];
  onSelect: (id: string) => void;
  onScratch: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            {t.templateTitle}
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.templateDesc}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {PIPELINE_TEMPLATES.map((tmpl) => {
            const services = tmpl.steps
              .map((s) => PIPELINE_SERVICES_MAP.get(s.serviceId))
              .filter(Boolean) as PipelineServiceDef[];

            return (
              <button
                key={tmpl.id}
                onClick={() => onSelect(tmpl.id)}
                className="text-left p-5 rounded-2xl border transition-all hover:scale-[1.02] hover:shadow-lg group"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderColor: 'var(--color-border)',
                }}
              >
                {/* Service icons row */}
                <div className="flex items-center gap-1 mb-3">
                  {services.map((svc, i) => (
                    <span key={i} className="flex items-center gap-0.5">
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: svc.accent + '20', color: svc.accent }}
                      >
                        {svc.icon}
                      </span>
                      {i < services.length - 1 && (
                        <span className="text-[10px] mx-0.5" style={{ color: 'var(--color-text-tertiary)' }}>→</span>
                      )}
                    </span>
                  ))}
                </div>

                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
                  {tmpl.name[lang] ?? tmpl.name.en}
                </h3>
                <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                  {tmpl.description[lang] ?? tmpl.description.en}
                </p>

                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                  >
                    {tmpl.steps.length} {t.stepCount}
                  </span>
                  {tmpl.tags.includes('popular') && (
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: '#fbbf24', color: '#1a1a1a' }}
                    >
                      ★ Popular
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Build from scratch card */}
          <button
            onClick={onScratch}
            className="p-5 rounded-2xl border-2 border-dashed transition-all hover:scale-[1.02] hover:border-solid flex flex-col items-center justify-center gap-2 min-h-[160px]"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              +
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t.scratchTitle}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.scratchDesc}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Service Palette Card ─────────────────────────────────────────────── */

function ServiceCard({
  service,
  lang,
  onAdd,
}: {
  service: PipelineServiceDef;
  lang: 'en' | 'ka' | 'ru';
  onAdd: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onAdd(service.id)}
      className="w-full text-left p-2.5 rounded-xl border transition-all hover:scale-[1.02] group"
      style={{
        backgroundColor: 'transparent',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 transition-transform group-hover:scale-110"
          style={{ backgroundColor: service.accent + '20', color: service.accent }}
        >
          {service.icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>
            {service.name[lang] ?? service.name.en}
          </div>
          <div className="text-[10px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
            {service.inputTypes.slice(0, 3).join(' · ')} → {service.outputTypes.join(' · ')}
          </div>
        </div>
      </div>
    </button>
  );
}
