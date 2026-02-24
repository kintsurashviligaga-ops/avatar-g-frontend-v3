'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { RocketLogo } from '@/components/ui/RocketLogo';
import { useEffect } from 'react';

type HeroProps = {
  locale: string;
};

export function Hero({ locale }: HeroProps) {
  useEffect(() => {
    console.log('BUILD VERSION:', process.env.NEXT_PUBLIC_BUILD_ID);
  }, []);

  return (
    <section className="relative px-4 pb-20 pt-28" data-build-id={process.env.NEXT_PUBLIC_BUILD_ID}>
      {/* Route sanity check: edit this shared hero for /en and /ka (root / redirects to default locale). */}
      <div className="mx-auto max-w-6xl text-center">
        <div className="mb-6 flex items-center justify-center gap-3">
          <RocketLogo size="md" animated glow />
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-1 text-sm text-cyan-200">
            Georgian-first AI პლატფორმა
          </span>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="mx-auto max-w-4xl text-4xl font-bold leading-tight text-white md:text-6xl"
        >
          AI პლატფორმა, რომელიც{' '}
          <span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-cyan-300 bg-[length:200%_200%] bg-clip-text text-transparent animate-pulse">
            მუშაობს შენთვის
          </span>
        </motion.h1>

        <p className="mx-auto mt-6 max-w-3xl text-lg text-slate-300 md:text-xl">
          შექმენი ტექსტი, სურათი, ვიდეო და ავტომატიზაცია ერთ სივრცეში — სწრაფად და პროფესიონალურად.
        </p>

        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href={`/${locale}/workspace`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-8 py-4 font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:scale-[1.02]"
          >
            დაწყება
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={`/${locale}/services`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-4 font-semibold text-white transition hover:bg-white/10"
          >
            როგორ მუშაობს
            <PlayCircle className="h-4 w-4" />
          </Link>
        </div>

        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
          {['სრულად ქართულად', 'უსაფრთხო სისტემა', 'ბიზნესებისთვის მზად'].map((item) => (
            <div key={item} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 backdrop-blur">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
