'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { useWorkspace } from './WorkspaceProvider'
import { formatDate, getServiceIcon } from '@/lib/utils'
import type { PipelineJobStatus } from '@/lib/types'

const statusVariants: Record<PipelineJobStatus, { variant: 'default' | 'info' | 'success' | 'warning'; label: string }> = {
  queued: { variant: 'default', label: 'Queued' },
  processing: { variant: 'info', label: 'Processing' },
  ready: { variant: 'success', label: 'Ready' },
  error: { variant: 'warning', label: 'Error' },
}

const PipelinePanel: React.FC = () => {
  const { pipelineJobs } = useWorkspace()

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-silver mb-1">Neural Pipeline</h3>
            <p className="text-sm text-silver/50">Asset flow between services</p>
          </div>
          <Badge variant="info">{pipelineJobs.length} Jobs</Badge>
        </div>

        {pipelineJobs.length === 0 ? (
          <div className="glass-card rounded-xl p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-silver/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-silver/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h4 className="text-base font-semibold text-silver/70 mb-2">No Pipeline Jobs</h4>
            <p className="text-sm text-silver/40">Drag assets from Library to Services to create connections</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pipelineJobs.map((job, index) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {job.sourceService && (
                        <>
                          <div className="w-10 h-10 rounded-lg glass-card flex items-center justify-center border border-silver/10">
                            <span className="text-xl">{getServiceIcon(job.sourceService)}</span>
                          </div>
                          <svg className="w-5 h-5 text-silver/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </>
                      )}
                      <div className="w-10 h-10 rounded-lg glass-card flex items-center justify-center border border-silver/10">
                        <span className="text-xl">{getServiceIcon(job.targetService)}</span>
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h5 className="text-sm font-medium text-silver capitalize">{job.action}</h5>
                        <Badge variant={statusVariants[job.status].variant}>
                          {statusVariants[job.status].label}
                        </Badge>
                      </div>
                      <p className="text-xs text-silver/50">{formatDate(job.createdAt)}</p>
                      {job.error && (
                        <p className="text-xs text-red-400 mt-1">{job.error}</p>
                      )}
                    </div>

                    {job.status === 'processing' && (
                      <div className="w-6 h-6 rounded-full border-2 border-silver/20 border-t-silver animate-spin"></div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default PipelinePanel
