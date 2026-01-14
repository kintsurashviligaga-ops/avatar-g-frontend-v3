'use client'

import React from 'react'
import { motion } from 'framer-motion'
import type { ServiceConfig } from '@/lib/types'

interface ServiceCardProps {
  service: ServiceConfig
  onSelect: () => void
}

const ServiceCard: React.FC<ServiceCardProps> = ({ service, onSelect }) => {
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ scale: 1.05, y: -4 }}
      whileTap={{ scale: 0.95 }}
      className="w-full group relative overflow-hidden glass-card rounded-xl p-6 text-left transition-all duration-300 hover:border-silver/20"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${service.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
      
      <div className="relative z-10">
        <div className="mb-4">
          <span className="text-4xl">{service.icon}</span>
        </div>
        
        <h3 className="text-lg font-bold text-silver mb-1">{service.title}</h3>
        <p className="text-xs text-silver/50 mb-4">{service.subtitle}</p>
        
        <div className="flex items-center text-silver/70 text-xs font-medium group-hover:text-silver transition-colors">
          Launch Module
          <svg
            className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </motion.button>
  )
}

export default ServiceCard
