'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  UserCircle2,
  ImageIcon,
  Film,
  Music2,
  FileText,
  Zap,
} from 'lucide-react';
import { CreditBadge } from '@/components/ui/CreditBadge';
import { AGENT_COSTS, type AgentType } from '@/store/useAiPipelineStore';

// ─── Agent manifest ───────────────────────────────────────────────────────────

const AGENTS: {
  id:          AgentType;
  title:       string;
  description: string;
  href:         string;
  icon:        React.ReactNode;
  gradient:    string;
  badge:       string;
}[] = [
  {
    id          : 'avatar',
    title       : 'Avatar Generator',
    description : 'Design AI avatars with custom personality, appearance, and voice style.',
    href        : '/studio/avatar',
    icon        : <UserCircle2 size={24} />,
    gradient    : 'from-cyan-500 to-blue-600',
    badge       : 'Most popular',
  },
  {
    id          : 'image',
    title       : 'Image Generator',
    description : 'Get expert diffusion model prompts optimised for FLUX, SDXL, and more.',
    href        : '/studio/image',
    icon        : <ImageIcon size={24} />,
    gradient    : 'from-violet-500 to-fuchsia-600',
    badge       : '',
  },
  {
    id          : 'video',
    title       : 'Video Generator',
    description : 'Generate shot-by-shot video scripts and production-ready prompts.',
    href        : '/studio/video',
    icon        : <Film size={24} />,
    gradient    : 'from-rose-500 to-orange-500',
    badge       : '',
  },
  {
    id          : 'music',
    title       : 'Music Generator',
    description : 'Compose AI music with genre, BPM, instruments and generation prompts.',
    href        : '/studio/music',
    icon        : <Music2 size={24} />,
    gradient    : 'from-emerald-500 to-teal-600',
    badge       : '',
  },
  {
    id          : 'copy',
    title       : 'Copy / SEO',
    description : 'Headlines, body copy, CTAs and meta tags — ready to publish.',
    href        : '/studio/copy',
    icon        : <FileText size={24} />,
    gradient    : 'from-amber-500 to-yellow-500',
    badge       : 'Cheapest',
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  return (
    <div className="min-h-screen bg-transparent text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">AI Studio</h1>
              <p className="mt-1 text-white/50 text-sm">
                Choose a generator. Each run deducts credits from your balance.
              </p>
            </div>
            <CreditBadge />
          </div>
        </motion.div>

        {/* Agent grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
            >
              <Link
                href={agent.href}
                className="group relative flex flex-col gap-4 rounded-2xl border border-white/[0.10] bg-[linear-gradient(155deg,rgba(12,22,46,0.88),rgba(7,14,32,0.80))] backdrop-blur-xl p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_16px_48px_rgba(0,0,0,0.40)] transition-all duration-300 hover:border-white/[0.18] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_20px_56px_rgba(0,0,0,0.50)] hover:-translate-y-0.5 overflow-hidden"
              >
                {/* Top accent line */}
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

                {/* Hover glow */}
                <div className={`absolute inset-0 bg-gradient-to-br ${agent.gradient} opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300 pointer-events-none`} />

                {/* Icon */}
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${agent.gradient} shadow-[0_0_20px_rgba(34,211,238,0.2)] text-white`}
                >
                  {agent.icon}
                </div>

                {/* Text */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-white leading-tight">
                      {agent.title}
                    </h2>
                    {agent.badge && (
                      <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                        {agent.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white/50 leading-relaxed">
                    {agent.description}
                  </p>
                </div>

                {/* Cost pill */}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs text-white/35">
                    <Zap className="h-3 w-3 text-cyan-400/60" />
                    {AGENT_COSTS[agent.id]} credits
                  </span>
                  <span className="text-xs text-white/25 group-hover:text-white/50 transition-colors">
                    Open →
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

      </div>
    </div>
  );
}
