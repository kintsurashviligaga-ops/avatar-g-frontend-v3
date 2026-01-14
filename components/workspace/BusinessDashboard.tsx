'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

const actionCards = [
  { title: 'Revenue Plan', value: '$125K', trend: '+23%', color: 'from-green-500/20 to-emerald-500/20' },
  { title: 'Acquisition', value: '2.4K', trend: '+15%', color: 'from-blue-500/20 to-cyan-500/20' },
  { title: 'ROI Estimate', value: '340%', trend: '+8%', color: 'from-purple-500/20 to-pink-500/20' },
  { title: 'Conversion', value: '12.5%', trend: '+5%', color: 'from-orange-500/20 to-red-500/20' },
]

const BusinessDashboard: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-xl p-8 mb-6 bg-gradient-to-br from-slate-500/10 to-zinc-500/10"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-600 to-zinc-600 flex items-center justify-center">
              <span className="text-3xl">💼</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-silver">Business Agent</h2>
                <Badge variant="warning">Alpha</Badge>
              </div>
              <p className="text-sm text-silver/50">Strategy • Analytics • Growth</p>
            </div>
          </div>
          <p className="text-silver/70">
            AI-powered business intelligence and strategy recommendations for growth and optimization.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {actionCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className={`bg-gradient-to-br ${card.color}`}>
                <p className="text-xs font-medium text-silver/70 mb-2">{card.title}</p>
                <p className="text-2xl font-bold text-silver mb-1">{card.value}</p>
                <p className="text-xs text-green-400">{card.trend}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-sm font-semibold text-silver mb-4">Revenue Projection</h3>
            <div className="space-y-2">
              {[
                { month: 'Jan', value: 40 },
                { month: 'Feb', value: 55 },
                { month: 'Mar', value: 70 },
                { month: 'Apr', value: 85 },
                { month: 'May', value: 95 },
                { month: 'Jun', value: 100 },
              ].map((data) => (
                <div key={data.month} className="flex items-center gap-3">
                  <span className="text-xs text-silver/50 w-8">{data.month}</span>
                  <div className="flex-1 h-6 glass-card rounded overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500/50 to-emerald-500/50"
                      style={{ width: `${data.value}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-silver/70 w-12 text-right">${data.value}K</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-silver mb-4">Next Actions</h3>
            <div className="space-y-3">
              {[
                { action: 'Launch email campaign', priority: 'High', status: 'Ready' },
                { action: 'Update pricing page', priority: 'Medium', status: 'In Progress' },
                { action: 'A/B test hero section', priority: 'High', status: 'Planned' },
                { action: 'Social media audit', priority: 'Low', status: 'Planned' },
              ].map((item, i) => (
                <div key={i} className="glass-card p-3 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm text-silver mb-1">{item.action}</p>
                    <div className="flex gap-2">
                      <Badge variant={item.priority === 'High' ? 'warning' : 'default'} className="text-xs">
                        {item.priority}
                      </Badge>
                      <Badge variant="info" className="text-xs">
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default BusinessDashboard
