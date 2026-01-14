'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { useWorkspace } from './WorkspaceProvider'
import { services } from './Sidebar'

const ServiceGrid: React.FC = () => {
  const { setActiveService } = useWorkspace()

  return (
    <div className="w-full h-full overflow-y-auto bg-obsidian">
      <div className="w-full px-4 py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-silver mb-2">
            Choose Your Service
          </h2>
          <p className="text-sm text-silver/50">
            Select an AI module to begin
          </p>
        </div>

        {/* Services List - Mobile Only */}
        <div className="space-y-3 max-w-md mx-auto">
          {services.map((service, i) => (
            <button
              key={service.key}
              onClick={() => setActiveService(service.key)}
              className="w-full glass-card rounded-xl p-4 text-left active:bg-white/10 transition-all"
            >
              <div className="flex items-center gap-3">
                {/* Icon */}
                <div className="w-12 h-12 rounded-lg glass-panel flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">{service.icon}</span>
                </div>
                
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-silver truncate">
                    {service.title}
                  </h3>
                  <p className="text-xs text-silver/50 truncate">
                    {service.subtitle}
                  </p>
                </div>
                
                {/* Arrow */}
                <svg className="w-5 h-5 text-silver/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ServiceGrid
