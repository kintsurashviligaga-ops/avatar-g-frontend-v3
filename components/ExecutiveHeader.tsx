"use client";

import React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/navigation'
import { Sparkles, Globe } from 'lucide-react'
import { motion } from 'framer-motion'

export default function ExecutiveHeader() {
  const t = useTranslations('navigation')
  const locale = useLocale()
  
  const toggleLocale = () => {
    const newLocale = locale === 'ka' ? 'en' : 'ka'
    window.location.href = `/${newLocale}`
  }

  return (
    <motion.header 
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 glass"
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#d4af37] to-[#b8941f] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-black" />
          </div>
          <span className="text-xl font-bold text-white font-serif tracking-wider">
            Avatar G <span className="text-[#d4af37]">Executive</span>
          </span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/services" className="text-gray-300 hover:text-[#d4af37] transition-colors uppercase text-sm tracking-widest">
            {t('services')}
          </Link>
          <Link href="/workspace" className="text-gray-300 hover:text-[#d4af37] transition-colors uppercase text-sm tracking-widest">
            {t('workspace')}
          </Link>
        </nav>
        
        <button 
          onClick={toggleLocale}
          className="flex items-center gap-2 px-4 py-2 rounded-lg glass-gold text-[#d4af37] hover:text-white transition-colors"
        >
          <Globe className="w-4 h-4" />
          <span className="uppercase text-sm font-bold">{locale}</span>
        </button>
      </div>
    </motion.header>
  )
}
