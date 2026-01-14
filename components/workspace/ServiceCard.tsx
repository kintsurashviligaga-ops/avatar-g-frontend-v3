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
      className="w-full group relative overflow-hidden glass-card rounded-xl p-4 md:p-6 text-left transition-all duration-300 hover:border-silver/20 h-full min-h-[140px] md:min-h-[180px]"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${service.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
      
      <div className="relative z-10 h-full flex flex-col">
        <div className="mb-3 md:mb-4">
          <span className="text-3xl md:text-4xl">{service.icon}</span>
        </div>
        
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <h3 className="text-sm md:text-lg font-bold text-silver mb-1 line-clamp-2">{service.title}</h3>
            <p className="text-[10px] md:text-xs text-silver/50 line-clamp-1">{service.subtitle}</p>
          </div>
          
          <div className="flex items-center text-silver/70 text-[10px] md:text-xs font-medium group-hover:text-silver transition-colors mt-3 md:mt-4">
            <span className="truncate">Launch</span>
            <svg
              className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2 transform group-hover:translate-x-1 transition-transform flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </motion.button>
  )
}

export default ServiceCard
