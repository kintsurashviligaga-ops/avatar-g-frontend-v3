'use client'

import React from 'react'
import { motion } from 'framer-motion'
import ServiceCard from './ServiceCard'
import { useWorkspace } from './WorkspaceProvider'
import { services } from './Sidebar'

const ServiceGrid: React.FC = () => {
  const { setActiveService } = useWorkspace()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-7xl mx-auto px-6"
    >
      <div className="text-center mb-12">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-4xl font-bold text-silver mb-4"
        >
          Choose Your Service
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-lg text-silver/50"
        >
          Select an AI module to begin creating
        </motion.p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {services.map((service, index) => (
          <motion.div
            key={service.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <ServiceCard
              service={service}
              onSelect={() => setActiveService(service.key)}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

export default ServiceGrid
