'use client';

/**
 * GenericPanel — fallback panel for services that don't have
 * a custom panel yet (editing, photo, game, interior, software,
 * business, tourism, shop, media, prompt, visual-intel, next)
 */

import Link from 'next/link';
import type { ElementType } from 'react';
import {
  ArrowRight, Sparkles, ExternalLink,
  Video, Camera, Gamepad2, Sofa, Scissors, Film, Eye, Wand2,
  ShoppingCart, Code2, Briefcase, Plane, Zap, Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SupportedLocale } from '@/types/dashboard';

type ServiceInfo = {
  emoji:       string;
  label:       string;
  description: string;
  icon:        ElementType;
  gradient:    string;
  features:    string[];
  cost:        number;
};

type GenericPanelCopy = {
  costLabel: string;
  capabilitiesLabel: string;
  embeddedTitle: string;
  fullServiceTitle: string;
  embeddedDescription: (label: string) => string;
  fullServiceDescription: (label: string) => string;
  workflowAction: string;
  fullServiceAction: string;
  openAction: (label: string) => string;
  fallbackDescription: string;
  fallbackFeatures: string[];
};

const PANEL_COPY: Record<SupportedLocale, GenericPanelCopy> = {
  en: {
    costLabel: 'Cost',
    capabilitiesLabel: 'Capabilities',
    embeddedTitle: 'Connected in Workspace',
    fullServiceTitle: 'Open Full Service',
    embeddedDescription: (label) => `Keep ${label} connected to workflow routing without leaving the dashboard.`,
    fullServiceDescription: (label) => `Access the complete ${label} interface.`,
    workflowAction: 'Route Through Workflow',
    fullServiceAction: 'Full Service',
    openAction: (label) => `Open ${label}`,
    fallbackDescription: 'AI-powered service',
    fallbackFeatures: ['AI powered', 'Fast output', 'Integrated'],
  },
  ka: {
    costLabel: 'ღირებულება',
    capabilitiesLabel: 'შესაძლებლობები',
    embeddedTitle: 'დაკავშირებულია სამუშაო სივრცეში',
    fullServiceTitle: 'სრული სერვისის გახსნა',
    embeddedDescription: (label) => `${label} დარჩება workflow-სთან დაკავშირებული დეშბორდიდან გასვლის გარეშე.`,
    fullServiceDescription: (label) => `${label}-ის სრული ინტერფეისის გახსნა.`,
    workflowAction: 'Workflow-ში გადატანა',
    fullServiceAction: 'სრული სერვისი',
    openAction: (label) => `${label}-ის გახსნა`,
    fallbackDescription: 'AI სერვისი',
    fallbackFeatures: ['AI მხარდაჭერა', 'სწრაფი შედეგი', 'ინტეგრირებული'],
  },
  ru: {
    costLabel: 'Стоимость',
    capabilitiesLabel: 'Возможности',
    embeddedTitle: 'Подключено в рабочем пространстве',
    fullServiceTitle: 'Открыть полный сервис',
    embeddedDescription: (label) => `Сервис ${label} останется связанным с workflow без выхода из дашборда.`,
    fullServiceDescription: (label) => `Открыть полный интерфейс сервиса ${label}.`,
    workflowAction: 'Направить в Workflow',
    fullServiceAction: 'Полный сервис',
    openAction: (label) => `Открыть ${label}`,
    fallbackDescription: 'AI-сервис',
    fallbackFeatures: ['Поддержка AI', 'Быстрый результат', 'Интегрировано'],
  },
};

function getSafeLocale(locale?: string): SupportedLocale {
  return locale === 'ka' || locale === 'ru' ? locale : 'en';
}

const SERVICE_INFO: Record<string, ServiceInfo> = {
  'auto-workflows': { emoji:'⚙️', label:'Auto Workflows', description:'Launch recurring automation sequences and connected multi-step runs.', icon:Zap, gradient:'from-red-500 to-rose-600', features:['Scheduled runs', 'Batch execution', 'Retry logic', 'Cross-service routing', 'Recurring automation'], cost:6 },
  editing:      { emoji:'✂️', label:'Video Editing', description:'Polish raw video into launch-ready edits with fast pipelines.', icon:Scissors, gradient:'from-orange-500 to-amber-600', features:['Auto-cut', 'Transitions', 'Color grading', 'Subtitles', 'Export formats'], cost:12 },
  photo:        { emoji:'📷', label:'Photo Studio',  description:'Produce polished studio-quality photo assets.', icon:Camera, gradient:'from-blue-500 to-indigo-600', features:['Background removal', 'Retouching', 'Color correction', 'Batch processing', 'Style transfer'], cost:4 },
  game:         { emoji:'🎮', label:'Game Creator',  description:'Build interactive AI-powered games and simulations.', icon:Gamepad2, gradient:'from-lime-500 to-green-600', features:['Game assets', 'Level design', 'Character creation', 'Script generation', 'Unity export'], cost:20 },
  interior:     { emoji:'🛋️', label:'Interior Design',description:'Redesign rooms with AI-powered professional tools.', icon:Sofa, gradient:'from-amber-500 to-yellow-600', features:['Room rendering', 'Style presets', 'Furniture placement', '3D visualization', 'Material library'], cost:8 },
  media:        { emoji:'📡', label:'Media Hub',     description:'Coordinate multi-format production pipelines.', icon:Film, gradient:'from-red-500 to-rose-600', features:['Multi-format output', 'Batch processing', 'CDN distribution', 'Format conversion', 'Analytics'], cost:6 },
  'visual-intel':{ emoji:'🔍', label:'Visual Intel', description:'Evaluate visuals and detect quality gaps.', icon:Eye, gradient:'from-indigo-500 to-violet-600', features:['Quality scoring', 'Object detection', 'Brand compliance', 'A/B comparison', 'AI feedback'], cost:3 },
  prompt:       { emoji:'💡', label:'Prompt Builder',description:'Standardize high-performance prompts for any AI model.', icon:Wand2, gradient:'from-yellow-500 to-orange-600', features:['Prompt templates', 'Model optimization', 'Variable injection', 'Version control', 'Batch testing'], cost:1 },
  shop:         { emoji:'🛒', label:'Online Shop',   description:'Publish products and assets through commerce operations.', icon:ShoppingCart, gradient:'from-rose-500 to-pink-600', features:['Product listings', 'Payment processing', 'Inventory', 'Analytics', 'Storefront builder'], cost:0 },
  software:     { emoji:'💻', label:'Software Dev',  description:'Build systems and integrations around AI workflows.', icon:Code2, gradient:'from-cyan-500 to-sky-600', features:['Code generation', 'API integration', 'Database design', 'Documentation', 'Security audit'], cost:15 },
  business:     { emoji:'💼', label:'Business Agent',description:'Drive operations and strategic business automation.', icon:Briefcase, gradient:'from-amber-500 to-yellow-600', features:['Strategy planning', 'Market analysis', 'Document drafting', 'Financial modeling', 'Competitor analysis'], cost:10 },
  tourism:      { emoji:'✈️', label:'Tourism AI',    description:'Tourism-focused automation and guest experiences.', icon:Plane, gradient:'from-sky-500 to-blue-600', features:['Itinerary planning', 'Local recommendations', 'Translation', 'Booking assistance', 'Cultural insights'], cost:5 },
  next:         { emoji:'🚀', label:'Expansion',     description:'Reserved for next-generation enterprise modules.', icon:Zap, gradient:'from-slate-500 to-gray-600', features:['Enterprise features', 'Custom integrations', 'Priority support', 'SLA guarantee', 'Custom models'], cost:0 },
};

interface GenericPanelProps {
  slug?: string;
  locale?: string;
  embedded?: boolean;
  onSelectService?: (service: string) => void;
  serviceInfo?: Partial<ServiceInfo>;
  copy?: Partial<GenericPanelCopy>;
}

export function GenericPanel({ slug = 'next', locale = 'en', embedded = false, onSelectService, serviceInfo, copy }: GenericPanelProps) {
  const safeLocale = getSafeLocale(locale);
  const resolvedCopy = { ...PANEL_COPY[safeLocale], ...copy };
  const info = {
    ...(SERVICE_INFO[slug] ?? {
      emoji: '🤖', label: slug, description: resolvedCopy.fallbackDescription,
      icon: Bot, gradient: 'from-slate-500 to-gray-600',
      features: resolvedCopy.fallbackFeatures, cost: 5,
    }),
    ...serviceInfo,
    features: serviceInfo?.features ?? (SERVICE_INFO[slug]?.features ?? resolvedCopy.fallbackFeatures),
  };
  const hrefSlug = slug === 'auto-workflows' ? 'media' : slug;

  const Icon = info.icon;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className={cn('w-14 h-14 rounded-3xl bg-gradient-to-br flex items-center justify-center shadow-xl text-2xl', info.gradient)}>
            {info.emoji}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{info.label}</h1>
            <p className="text-sm text-white/40 mt-0.5 max-w-md">{info.description}</p>
          </div>
          {info.cost > 0 && (
            <div className="ml-auto text-right">
              <span className="text-[11px] text-white/35">{resolvedCopy.costLabel}</span>
              <p className="text-lg font-bold text-white">{info.cost} <span className="text-[12px] text-white/40">cr</span></p>
            </div>
          )}
        </div>

        {/* Features Grid */}
        <div>
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">{resolvedCopy.capabilitiesLabel}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {info.features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                <Sparkles size={11} className="text-cyan-400 shrink-0" />
                <span className="text-[12px] text-white/70">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className={cn(
          'rounded-2xl bg-gradient-to-r p-px',
          info.gradient,
        )}>
          <div className="rounded-[calc(1rem-1px)] bg-[#05050e] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Icon className="w-6 h-6 text-white/60" />
              <div>
                <p className="text-[14px] font-bold text-white">{embedded ? resolvedCopy.embeddedTitle : resolvedCopy.fullServiceTitle}</p>
                <p className="text-[12px] text-white/40">
                  {embedded
                    ? resolvedCopy.embeddedDescription(info.label)
                    : resolvedCopy.fullServiceDescription(info.label)}
                </p>
              </div>
            </div>
            {embedded ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onSelectService?.('workflow')}
                  className={cn(
                    'w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-[14px] font-bold transition-all text-white bg-gradient-to-r hover:scale-[1.01]',
                    info.gradient,
                  )}
                >
                  {resolvedCopy.workflowAction}
                  <ArrowRight size={16} />
                </button>
                <Link
                  href={`/${locale}/services/${hrefSlug}`}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-[14px] font-bold transition-all text-white border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                >
                  {resolvedCopy.fullServiceAction}
                  <ExternalLink size={16} />
                </Link>
              </div>
            ) : (
              <Link
                href={`/${locale}/services/${hrefSlug}`}
                className={cn(
                  'w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-[14px] font-bold transition-all text-white bg-gradient-to-r hover:scale-[1.01]',
                  info.gradient,
                )}
              >
                {resolvedCopy.openAction(info.label)}
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
