'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CoreAvatar } from '@/components/CoreAvatar';
import { useLanguage } from '@/lib/i18n/LanguageContext';

type OrbitModule = {
  title: string;
  description: string;
  href: string;
  ring: 0 | 1 | 2;
  icon: string;
  color: string;
};

const MODULES: OrbitModule[] = [
  { title: 'Avatar', description: 'Build and manage your digital avatar pipeline.', href: '/services/avatar', ring: 0, icon: '🧑', color: 'from-cyan-400 to-blue-500' },
  { title: 'Agent G', description: 'AI operator that routes and orchestrates tasks.', href: '/services/agent-g', ring: 0, icon: '🤖', color: 'from-purple-400 to-indigo-500' },
  { title: 'Workflow', description: 'Compose chained automations across services.', href: '/services/workflow', ring: 0, icon: '🧭', color: 'from-emerald-400 to-teal-500' },
  { title: 'Video', description: 'Generate cinematic videos from guided input.', href: '/services/video', ring: 0, icon: '🎬', color: 'from-rose-400 to-pink-500' },
  { title: 'Software', description: 'AI-assisted code generation and deployment.', href: '/services/software', ring: 0, icon: '💻', color: 'from-violet-400 to-purple-500' },
  { title: 'Media', description: 'Produce campaign-ready multimedia outputs.', href: '/services/media', ring: 1, icon: '📽️', color: 'from-orange-400 to-amber-500' },
  { title: 'Music', description: 'Generate tracks and production-ready stems.', href: '/services/music', ring: 1, icon: '🎵', color: 'from-pink-400 to-rose-500' },
  { title: 'Photo', description: 'Create editorial-grade photo outputs.', href: '/services/photo', ring: 1, icon: '📸', color: 'from-sky-400 to-cyan-500' },
  { title: 'Editing', description: 'Universal video editing powered by AI.', href: '/services/editing', ring: 1, icon: '✂️', color: 'from-lime-400 to-green-500' },
  { title: 'Visual Intel', description: 'Analyze and optimize visual creative assets.', href: '/services/visual-intel', ring: 1, icon: '🧠', color: 'from-fuchsia-400 to-purple-500' },
  { title: 'Business', description: 'Market research, decks, and financial modeling.', href: '/services/business', ring: 1, icon: '💼', color: 'from-blue-400 to-indigo-500' },
  { title: 'Image', description: 'Generate design-ready image concepts.', href: '/services/image', ring: 2, icon: '🖼️', color: 'from-amber-400 to-orange-500' },
  { title: 'Text', description: 'Generate and optimize strategic copy.', href: '/services/text', ring: 2, icon: '📝', color: 'from-teal-400 to-cyan-500' },
  { title: 'Prompt', description: 'Design reusable high-performing prompt systems.', href: '/services/prompt', ring: 2, icon: '🧩', color: 'from-indigo-400 to-blue-500' },
  { title: 'Shop', description: 'Launch and manage your commerce storefront.', href: '/services/shop', ring: 2, icon: '🛍️', color: 'from-green-400 to-emerald-500' },
  { title: 'Tourism', description: 'AI-powered travel planning and local guides.', href: '/services/tourism', ring: 2, icon: '✈️', color: 'from-cyan-400 to-sky-500' },
];

const RING_CONFIG = [
  { className: 'animate-orbitSlowMobile sm:animate-orbitSlow', glowColor: 'rgba(34,211,238,0.25)' },
  { className: 'animate-orbitMidMobile sm:animate-orbitMid', glowColor: 'rgba(139,92,246,0.2)' },
  { className: 'animate-orbitSlowRevMobile sm:animate-orbitSlowRev', glowColor: 'rgba(236,72,153,0.15)' },
] as const;

function groupByRing(modules: OrbitModule[]): OrbitModule[][] {
  return [0, 1, 2].map((ring) => modules.filter((item) => item.ring === ring));
}

export function OrbitSolarSystem() {
  const [activeMobile, setActiveMobile] = useState<OrbitModule | null>(null);
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const grouped = useMemo(() => groupByRing(MODULES), []);
  const { language: locale } = useLanguage();
  const localeHref = (path: string) => `/${locale}${path}`;

  return (
    <section className="relative mx-auto w-full max-w-6xl py-8">
      {/* Section header */}
      <motion.div
        className="mb-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/[0.05] backdrop-blur-sm mb-4">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-medium text-cyan-300 tracking-wider uppercase">Live Orbit System</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
          16 AI Modules.{' '}
          <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            One Universe.
          </span>
        </h2>
        <p className="text-gray-400 max-w-lg mx-auto text-sm md:text-base">
          Every module orbits your Core Avatar — click any node to explore.
        </p>
      </motion.div>

      {/* Orbit visualization */}
      <div className="relative mx-auto h-[360px] w-full max-w-[360px] md:h-[620px] md:max-w-[620px]">
        {/* Ambient glow behind orbit */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500/[0.06] via-transparent to-purple-500/[0.04] blur-2xl" />

        {grouped.map((ringModules, ringIndex) => {
          const config = RING_CONFIG[ringIndex] ?? RING_CONFIG[0];

          return (
            <div
              key={`ring-${ringIndex}`}
              className={`absolute inset-0 rounded-full motion-reduce:animate-none ${config.className}`}
              style={{
                border: '1px solid transparent',
                backgroundImage: `linear-gradient(#050510, #050510), linear-gradient(135deg, ${config.glowColor}, transparent 60%)`,
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
              }}
            >
              {ringModules.map((module, index) => {
                const angle = (360 / ringModules.length) * index;
                const radiusClass =
                  ringIndex === 0
                    ? 'max-md:[--orbit-r:92px] md:[--orbit-r:130px]'
                    : ringIndex === 1
                    ? 'max-md:[--orbit-r:130px] md:[--orbit-r:195px]'
                    : 'max-md:[--orbit-r:164px] md:[--orbit-r:260px]';
                const isHovered = hoveredModule === module.title;

                return (
                  <div
                    key={module.title}
                    className={`group absolute left-1/2 top-1/2 ${radiusClass}`}
                    style={{
                      transform: `rotate(${angle}deg) translateY(calc(-1 * var(--orbit-r))) rotate(-${angle}deg)`,
                    }}
                  >
                    <motion.button
                      type="button"
                      onClick={() => setActiveMobile(module)}
                      onMouseEnter={() => setHoveredModule(module.title)}
                      onMouseLeave={() => setHoveredModule(null)}
                      className={`
                        relative rounded-full px-2.5 py-1 md:px-3.5 md:py-1.5
                        text-[10px] md:text-xs font-semibold
                        border backdrop-blur-sm
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300
                        transition-all duration-300
                        ${isHovered
                          ? 'border-cyan-400/60 bg-cyan-500/20 text-white shadow-[0_0_30px_rgba(34,211,238,0.3)] scale-110 z-20'
                          : 'border-white/[0.12] bg-[#0B152A]/90 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]'
                        }
                      `}
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.95 }}
                      aria-haspopup="dialog"
                      aria-label={`${module.title} details`}
                    >
                      <span className="mr-1">{module.icon}</span>
                      {module.title}
                      {isHovered && (
                        <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-400/20 to-purple-400/20 blur-md -z-10" />
                      )}
                    </motion.button>

                    {/* Desktop hover card */}
                    <AnimatePresence>
                      {isHovered && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="absolute left-1/2 top-[calc(100%+12px)] z-30 hidden w-72 -translate-x-1/2 rounded-2xl border border-white/[0.1] bg-[#0A0F1E]/95 backdrop-blur-xl p-4 text-left md:block"
                        >
                          <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${module.color} mb-3`} />
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <span className="text-lg">{module.icon}</span>
                            {module.title}
                          </h3>
                          <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">{module.description}</p>
                          <Link
                            href={localeHref(module.href)}
                            className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold bg-gradient-to-r ${module.color} bg-clip-text text-transparent hover:opacity-80 transition-opacity`}
                          >
                            Open module →
                          </Link>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Core Avatar */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-floatSoft motion-reduce:animate-none">
          <div className="relative">
            <div className="absolute -inset-4 animate-glow-pulse rounded-full bg-gradient-to-r from-cyan-500/20 via-blue-500/15 to-purple-500/20 blur-xl" />
            <CoreAvatar className="relative h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40" />
          </div>
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {activeMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-4 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={`${activeMobile.title} details`}
            onClick={() => setActiveMobile(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-[380px] rounded-3xl border border-white/[0.1] bg-[#0A0F1E]/98 backdrop-blur-xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`h-1.5 w-16 rounded-full bg-gradient-to-r ${activeMobile.color} mb-5 mx-auto`} />
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{activeMobile.icon}</span>
                <h3 className="text-lg font-bold text-white">{activeMobile.title}</h3>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mb-5">{activeMobile.description}</p>
              <div className="flex items-center justify-between">
                <Link
                  href={localeHref(activeMobile.href)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r ${activeMobile.color} text-white shadow-lg`}
                >
                  Open Module
                </Link>
                <button
                  type="button"
                  onClick={() => setActiveMobile(null)}
                  className="px-4 py-2.5 rounded-xl border border-white/[0.1] text-xs text-gray-400 hover:bg-white/[0.05] transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
