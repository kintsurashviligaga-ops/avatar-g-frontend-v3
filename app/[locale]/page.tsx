'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { 
  ArrowRight,
  Zap
} from 'lucide-react';
import { SERVICE_REGISTRY } from '@/lib/service-registry';

export default function HomePage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params.locale;
  const [landingAvatar, setLandingAvatar] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadLandingProfile = async () => {
      try {
        const response = await fetch('/api/profile/landing', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const data = await response.json() as {
          avatarUrl?: string | null;
          isPremium?: boolean;
        };

        if (!isMounted) {
          return;
        }

        setLandingAvatar(data.avatarUrl || null);
        setIsPremium(Boolean(data.isPremium));
      } catch {
        if (isMounted) {
          setLandingAvatar(null);
          setIsPremium(false);
        }
      }
    };

    void loadLandingProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const services = SERVICE_REGISTRY.filter((service) => service.enabled);
  const gradients = [
    'from-purple-500 to-pink-500',
    'from-cyan-500 to-blue-500',
    'from-orange-500 to-red-500',
    'from-green-500 to-emerald-500',
    'from-violet-500 to-purple-500',
    'from-blue-500 to-indigo-500',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A]">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          {/* Animated Background */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="w-[600px] h-[600px] bg-gradient-to-r from-cyan-500/20 to-purple-500/20 rounded-full blur-3xl" />
          </motion.div>

          {/* Hero Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="relative z-10"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="inline-block mb-6"
            >
              <div className="px-6 py-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 rounded-full">
                <span className="text-cyan-400 text-sm font-medium flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  {t('hero.subtitle')}
                </span>
              </div>
            </motion.div>

            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
              {t('hero.title')}
              <br />
              <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                {t('hero.subtitle')}
              </span>
            </h1>

            <p className="text-xl text-gray-400 mb-12 max-w-3xl mx-auto">
              {t('hero.description')}
            </p>

            <div className="mb-10 flex flex-col items-center gap-4">
              <div className="relative h-28 w-28 overflow-hidden rounded-full border border-cyan-400/40 bg-white/5">
                {landingAvatar ? (
                  <Image
                    src={landingAvatar}
                    alt="Avatar G user avatar"
                    fill
                    className="object-cover"
                    sizes="112px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/20 to-purple-500/20 text-xs text-cyan-200">
                    Demo Avatar
                  </div>
                )}
              </div>

              {isPremium ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-1 text-sm text-amber-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Avatar G Agent (premium) • Agent Online
                </div>
              ) : (
                <button
                  onClick={() => router.push(`/${locale}/pricing`)}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-1 text-sm text-amber-300 hover:bg-amber-500/20"
                >
                  <Zap className="h-4 w-4" />
                  Premium Badge • Unlock superhero suit mode
                </button>
              )}
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                  onClick={() => router.push(`/${locale}/workspace`)}
                className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/50 flex items-center justify-center gap-2 group"
              >
                {t('hero.cta_primary')}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                  onClick={() => router.push(`/${locale}/pricing`)}
                className="px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors"
              >
                {t('hero.cta_secondary')}
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              {t('services.title')}
            </h2>
            <p className="text-xl text-gray-400">
              {t('services.subtitle')}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, index) => {
              const gradient = gradients[index % gradients.length];
              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -8 }}
                  onClick={() => router.push(`/${locale}${service.route}`)}
                  className="group relative p-8 bg-black/40 border border-white/10 rounded-2xl hover:border-white/20 transition-all cursor-pointer overflow-hidden"
                >
                  {/* Gradient Background */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-10 transition-opacity`} />

                  {/* Icon */}
                  <div className={`relative w-14 h-14 mb-4 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                    <span className="text-2xl">{service.icon}</span>
                  </div>

                  {/* Title */}
                  <h3 className="relative text-xl font-semibold text-white mb-2">
                    {service.name}
                  </h3>

                  {/* Arrow */}
                  <ArrowRight className="relative w-5 h-5 text-gray-400 group-hover:text-white group-hover:translate-x-2 transition-all" />
                </motion.div>
              );
            })}
          </div>

          {/* View All Services */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <button
              onClick={() => router.push(`/${locale}/services`)}
              className="px-8 py-3 border border-cyan-500/30 text-cyan-400 rounded-xl hover:bg-cyan-500/10 transition-colors"
            >
              {t('navigation.services')} →
            </button>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4 border-t border-white/10">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: `${services.length}+`, label: t('services.title') },
            { value: '100K+', label: 'Users' },
            { value: '1M+', label: 'Generations' },
            { value: '99.9%', label: 'Uptime' },
          ].map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
                {stat.value}
              </div>
              <div className="text-gray-400">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
