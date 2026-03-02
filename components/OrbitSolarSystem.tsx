'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { CoreAvatar } from '@/components/CoreAvatar';
import { useLanguage } from '@/lib/i18n/LanguageContext';

type OrbitModule = {
  title: string;
  description: string;
  href: string;
  ring: 0 | 1 | 2;
};

const MODULES: OrbitModule[] = [
  { title: 'Avatar', description: 'Build and manage your digital avatar pipeline.', href: '/services/avatar', ring: 0 },
  { title: 'Agent G', description: 'AI operator that routes and orchestrates tasks.', href: '/services/agent-g', ring: 0 },
  { title: 'Workflow', description: 'Compose chained automations across services.', href: '/services/workflow', ring: 0 },
  { title: 'Video', description: 'Generate cinematic videos from guided input.', href: '/services/video', ring: 0 },
  { title: 'Software', description: 'AI-assisted code generation and deployment.', href: '/services/software', ring: 0 },
  { title: 'Media', description: 'Produce campaign-ready multimedia outputs.', href: '/services/media', ring: 1 },
  { title: 'Music', description: 'Generate tracks and production-ready stems.', href: '/services/music', ring: 1 },
  { title: 'Photo', description: 'Create editorial-grade photo outputs.', href: '/services/photo', ring: 1 },
  { title: 'Editing', description: 'Universal video editing powered by AI.', href: '/services/editing', ring: 1 },
  { title: 'Visual Intel', description: 'Analyze and optimize visual creative assets.', href: '/services/visual-intel', ring: 1 },
  { title: 'Business', description: 'Market research, decks, and financial modeling.', href: '/services/business', ring: 1 },
  { title: 'Image', description: 'Generate design-ready image concepts.', href: '/services/image', ring: 2 },
  { title: 'Text', description: 'Generate and optimize strategic copy.', href: '/services/text', ring: 2 },
  { title: 'Prompt', description: 'Design reusable high-performing prompt systems.', href: '/services/prompt', ring: 2 },
  { title: 'Shop', description: 'Launch and manage your commerce storefront.', href: '/services/shop', ring: 2 },
  { title: 'Tourism', description: 'AI-powered travel planning and local guides.', href: '/services/tourism', ring: 2 },
];

const RING_CONFIG = [
  { className: 'animate-orbitSlowMobile sm:animate-orbitSlow' },
  { className: 'animate-orbitMidMobile sm:animate-orbitMid' },
  { className: 'animate-orbitSlowRevMobile sm:animate-orbitSlowRev' },
] as const;

function groupByRing(modules: OrbitModule[]): OrbitModule[][] {
  return [0, 1, 2].map((ring) => modules.filter((item) => item.ring === ring));
}

export function OrbitSolarSystem() {
  const [activeMobile, setActiveMobile] = useState<OrbitModule | null>(null);
  const grouped = useMemo(() => groupByRing(MODULES), []);
  const { language: locale } = useLanguage();
  const localeHref = (path: string) => `/${locale}${path}`;

  return (
    <section className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-4 md:p-8">
      <div className="mb-4 text-center">
        <h2 className="text-xl font-bold text-white md:text-2xl">Orbit Solar System</h2>
        <p className="mt-1 text-sm text-slate-300">16 modules orbiting around your live Core Avatar.</p>
      </div>

      <div className="relative mx-auto h-[320px] w-full max-w-[320px] md:h-[560px] md:max-w-[560px]">
        {grouped.map((ringModules, ringIndex) => {
          const config = RING_CONFIG[ringIndex] ?? RING_CONFIG[0];

          return (
            <div
              key={`ring-${ringIndex}`}
              className={`absolute inset-0 rounded-full border border-cyan-400/20 motion-reduce:animate-none ${config.className}`}
            >
              {ringModules.map((module, index) => {
                const angle = (360 / ringModules.length) * index;
                const radiusClass =
                  ringIndex === 0
                    ? 'max-md:[--orbit-r:88px] md:[--orbit-r:120px]'
                    : ringIndex === 1
                    ? 'max-md:[--orbit-r:122px] md:[--orbit-r:175px]'
                    : 'max-md:[--orbit-r:152px] md:[--orbit-r:230px]';

                return (
                  <div
                    key={module.title}
                    className={`group absolute left-1/2 top-1/2 ${radiusClass}`}
                    style={{
                      transform: `rotate(${angle}deg) translateY(calc(-1 * var(--orbit-r))) rotate(-${angle}deg)`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveMobile(module)}
                      className="rounded-full border border-cyan-400/40 bg-[#0B152A] px-2 py-1 text-[10px] font-medium text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 md:px-3 md:py-1.5 md:text-xs"
                      aria-haspopup="dialog"
                      aria-label={`${module.title} details`}
                    >
                      {module.title}
                    </button>

                    <div className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-20 hidden w-64 -translate-x-1/2 rounded-xl border border-white/15 bg-[#060B18]/95 backdrop-blur-md p-3 text-left opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 md:block">
                      <Image src="/previews/services.png" alt="Service preview" width={256} height={96} className="h-24 w-full rounded-md object-cover" />
                      <h3 className="mt-2 text-sm font-semibold text-white">{module.title}</h3>
                      <p className="mt-1 text-xs text-slate-300">{module.description}</p>
                      <Link href={localeHref(module.href)} className="mt-2 inline-block text-xs font-semibold text-cyan-300 hover:text-cyan-200">
                        Open module
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-floatSoft motion-reduce:animate-none">
          <CoreAvatar className="h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40" />
        </div>
      </div>

      {activeMobile && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 md:hidden" role="dialog" aria-modal="true" aria-label={`${activeMobile.title} details`} onClick={() => setActiveMobile(null)}>
          <div className="w-full max-w-[320px] rounded-2xl border border-white/15 bg-[#081325] p-4" onClick={(event) => event.stopPropagation()}>
            <Image src="/previews/services.png" alt="Service preview" width={256} height={96} className="h-24 w-full rounded-md object-cover" />
            <h3 className="mt-3 text-base font-semibold text-white">{activeMobile.title}</h3>
            <p className="mt-2 text-sm text-slate-300">{activeMobile.description}</p>
            <div className="mt-4 flex items-center justify-between">
              <Link href={localeHref(activeMobile.href)} className="text-sm font-semibold text-cyan-300">
                Open module
              </Link>
              <button type="button" onClick={() => setActiveMobile(null)} className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-slate-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
