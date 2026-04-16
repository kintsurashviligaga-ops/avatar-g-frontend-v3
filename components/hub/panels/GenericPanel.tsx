'use client';

/**
 * GenericPanel — fallback panel for services that don't have
 * a custom panel yet (editing, photo, game, interior, software,
 * business, tourism, shop, media, prompt, visual-intel, next)
 */

import Link from 'next/link';
import {
  ArrowRight, Sparkles, ExternalLink,
  Video, Camera, Gamepad2, Sofa, Scissors, Film, Eye, Wand2,
  ShoppingCart, Code2, Briefcase, Plane, Zap, Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ServiceInfo = {
  emoji:       string;
  label:       string;
  description: string;
  icon:        React.ElementType;
  gradient:    string;
  features:    string[];
  cost:        number;
};

const SERVICE_INFO: Record<string, ServiceInfo> = {
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
  slug:   string;
  locale: string;
}

export function GenericPanel({ slug, locale }: GenericPanelProps) {
  const info = SERVICE_INFO[slug] ?? {
    emoji: '🤖', label: slug, description: 'AI-powered service',
    icon: Bot, gradient: 'from-slate-500 to-gray-600',
    features: ['AI powered', 'Fast output', 'Integrated'], cost: 5,
  };

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
              <span className="text-[11px] text-white/35">Cost</span>
              <p className="text-lg font-bold text-white">{info.cost} <span className="text-[12px] text-white/40">cr</span></p>
            </div>
          )}
        </div>

        {/* Features Grid */}
        <div>
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">Capabilities</p>
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
                <p className="text-[14px] font-bold text-white">Open Full Service</p>
                <p className="text-[12px] text-white/40">Access the complete {info.label} interface</p>
              </div>
            </div>
            <Link
              href={`/${locale}/services/${slug}`}
              className={cn(
                'w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-[14px] font-bold transition-all text-white bg-gradient-to-r hover:scale-[1.01]',
                info.gradient,
              )}
            >
              Open {info.label}
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
