'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Upload, BrainCircuit, Sparkles, ShieldCheck, Download, ArrowRight, Image as ImageIcon, Video, Music, FileText } from 'lucide-react'

const steps = [
  {
    id: 'input',
    title: '1) Input',
    subtitle: 'Upload brief and assets',
    detail: 'Add prompt, photo, video or audio + goals and language.',
    icon: Upload,
    tone: 'from-cyan-500/25 to-cyan-300/10 border-cyan-300/35',
  },
  {
    id: 'orchestrate',
    title: '2) Agent G',
    subtitle: 'Smart orchestration',
    detail: 'Agent G picks the best service chain and quality settings.',
    icon: BrainCircuit,
    tone: 'from-blue-500/25 to-indigo-300/10 border-blue-300/35',
  },
  {
    id: 'generate',
    title: '3) Generation',
    subtitle: 'AI modules produce output',
    detail: 'Avatar, video, music, image and text modules run in sequence.',
    icon: Sparkles,
    tone: 'from-violet-500/25 to-fuchsia-300/10 border-violet-300/35',
  },
  {
    id: 'review',
    title: '4) QA + Review',
    subtitle: 'Validate and refine',
    detail: 'Automatic quality checks and optional user revisions.',
    icon: ShieldCheck,
    tone: 'from-emerald-500/25 to-emerald-300/10 border-emerald-300/35',
  },
  {
    id: 'export',
    title: '5) Output',
    subtitle: 'Export ready files',
    detail: 'Download production-ready content for social, web or campaigns.',
    icon: Download,
    tone: 'from-amber-500/25 to-orange-300/10 border-amber-300/35',
  },
] as const

const artifacts = [
  { label: 'Avatar', icon: ImageIcon },
  { label: 'Video', icon: Video },
  { label: 'Music', icon: Music },
  { label: 'Text/Plan', icon: FileText },
] as const

export function WorkflowCinematicSection() {
  return (
    <section id="workflow-cinematic" className="relative w-full py-24 border-t border-white/[0.06] overflow-hidden bg-transparent">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.14),transparent_52%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.14),transparent_54%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.72),rgba(2,6,23,0.52)_42%,rgba(2,6,23,0.72)_100%)]" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">How MyAvatar Works</h2>
          <p className="mt-4 text-sm md:text-base text-white/70">
            Clear end-to-end pipeline: from your input to final production files. Each step is visible, understandable, and controlled.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-3 items-stretch">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={step.id} className="relative">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: index * 0.07 }}
                  className={`h-full rounded-2xl border bg-gradient-to-b ${step.tone} backdrop-blur-sm p-4 md:p-5`}
                >
                  <div className="w-11 h-11 rounded-xl border border-white/20 bg-black/25 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-semibold text-white">{step.title}</p>
                  <p className="text-xs text-cyan-200/90 mt-1">{step.subtitle}</p>
                  <p className="text-xs text-white/70 leading-relaxed mt-3">{step.detail}</p>
                </motion.div>

                {index < steps.length - 1 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-2 -translate-y-1/2 z-20 w-4 h-4 items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-white/50" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.25 }}
          className="mt-10 rounded-2xl border border-white/[0.12] bg-white/[0.04] backdrop-blur-sm p-4 md:p-5"
        >
          <p className="text-xs uppercase tracking-[0.22em] text-white/55 mb-3">Output Artifacts</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {artifacts.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-3 flex items-center gap-2">
                  <Icon className="w-4 h-4 text-cyan-300" />
                  <span className="text-sm text-white/85">{item.label}</span>
                </div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
