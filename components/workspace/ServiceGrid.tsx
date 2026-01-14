'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { useWorkspace } from './WorkspaceProvider'
import { services } from './Sidebar'

const ServiceGrid: React.FC = () => {
  const { setActiveService } = useWorkspace()

  return (
    <div className="w-full h-full overflow-y-auto bg-obsidian">
      <div className="w-full px-4 py-6 md:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6 md:mb-8"
        >
          <h2 className="text-2xl md:text-4xl font-bold text-silver mb-2">
            Choose Your Service
          </h2>
          <p className="text-sm md:text-lg text-silver/50">
            Select an AI module to begin creating
          </p>
        </motion.div>

        {/* Mobile: Stack Layout */}
        <div className="md:hidden space-y-3">
          {services.map((service, index) => (
            <motion.button
              key={service.key}
              onClick={() => setActiveService(service.key)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              whileTap={{ scale: 0.98 }}
              className="w-full glass-card rounded-xl p-4 text-left transition-all duration-200 active:bg-white/10 relative overflow-hidden"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${service.accent} opacity-0 active:opacity-20 transition-opacity`}></div>
              
              <div className="relative flex items-center gap-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg glass-panel flex items-center justify-center">
                  <span className="text-2xl">{service.icon}</span>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-silver mb-0.5 truncate">
                    {service.title}
                  </h3>
                  <p className="text-xs text-silver/50 truncate">
                    {service.subtitle}
                  </p>
                </div>
                
                <svg
                  className="w-5 h-5 text-silver/30 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Desktop: Grid Layout */}
        <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-7xl mx-auto">
          {services.map((service, index) => (
            <motion.button
              key={service.key}
              onClick={() => setActiveService(service.key)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.05, y: -4 }}
              whileTap={{ scale: 0.95 }}
              className="group relative overflow-hidden glass-card rounded-xl p-6 text-left transition-all duration-300 hover:border-silver/20"
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
          ))}
        </div>
      </div>
    </div>
  )
}

export default ServiceGrid
