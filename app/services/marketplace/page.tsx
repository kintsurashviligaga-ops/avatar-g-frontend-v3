'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, Store, BarChart3, ShieldCheck } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import Link from 'next/link';

const features = [
  {
    icon: TrendingUp,
    title: 'ბაზრის ტრენდები',
    description: 'სექტორის დინამიკა, მოთხოვნის ტენდენციები და ზრდის სიგნალები რეალურ დროში.'
  },
  {
    icon: Store,
    title: 'კონკურენტული ხედვა',
    description: 'ფასების შედარება, კატეგორიების ანალიზი და პოზიციონირების რეკომენდაციები.'
  },
  {
    icon: BarChart3,
    title: 'გაყიდვების ანალიტიკა',
    description: 'შემოსავლების, კონვერსიის და GMV მაჩვენებლების დეტალური ხედვა.'
  },
  {
    icon: ShieldCheck,
    title: 'რისკების კონტროლი',
    description: 'მარგინალის დაცვა, VAT/Non-VAT შესაბამისობა და უსაფრთხო ოპერაციები.'
  }
];

export default function MarketplacePage() {
  return (
    <main className="relative min-h-screen bg-[#05070A]">
      <SpaceBackground />

      <div className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-full mb-4">
              <Store className="w-4 h-4 text-cyan-400" />
              <span className="text-cyan-300 text-sm font-medium">მარკეტპლეისი</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">
              მარკეტპლეისის <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">ზრდა და ანალიტიკა</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              მართე ფასები, ხედე ტენდენციები და გააძლიერე გაყიდვები AI-ით მხარდაჭერილი ანალიტიკით.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm h-full">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-cyan-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-400">{feature.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>

          <Card className="max-w-3xl mx-auto p-10 bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 border-cyan-500/30 backdrop-blur-sm text-center">
            <h2 className="text-3xl font-bold text-white mb-3">დაიწყე ანალიტიკა</h2>
            <p className="text-gray-300 mb-6">
              გახსენი მარკეტპლეისის პანელი და მიიღე რეკომენდაციები ფასებზე, მარაგზე და ზრდის სტრატეგიებზე.
            </p>
            <Link href="/dashboard/marketplace/growth">
              <Button className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold px-8 py-5 text-lg">
                მარკეტპლეისის პანელი
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </main>
  );
}
