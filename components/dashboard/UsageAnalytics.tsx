/**
 * Usage Analytics Chart Component
 * Shows credits usage, job distribution, and activity over time
 */

'use client';

import { motion } from 'framer-motion';
import { TrendingUp, Activity, Zap, Clock } from 'lucide-react';

interface UsageData {
  total_jobs: number;
  jobs_today: number;
  credits_spent_today: number;
  success_rate: number;
  top_services: Array<{ agent_id: string; count: number }>;
}

interface Props {
  data: UsageData;
}

export default function UsageAnalytics({ data }: Props) {
  const stats = [
    {
      label: 'Total Jobs',
      value: data.total_jobs,
      icon: Activity,
      color: 'text-cyan-400',
      change: '+12%',
    },
    {
      label: 'Today',
      value: data.jobs_today,
      icon: Clock,
      color: 'text-green-400',
      change: '+5',
    },
    {
      label: 'Success Rate',
      value: `${data.success_rate}%`,
      icon: TrendingUp,
      color: 'text-yellow-400',
      change: '+2.3%',
    },
    {
      label: 'Credits Used',
      value: data.credits_spent_today,
      icon: Zap,
      color: 'text-purple-400',
      change: data.credits_spent_today,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
              <span className="text-sm text-gray-400">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
          </motion.div>
        ))}
      </div>

      {/* Top Services */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Most Used Services</h3>
        <div className="space-y-3">
          {data.top_services.map((service, idx) => {
            const percentage = Math.min(
              (service.count / (data.total_jobs || 1)) * 100,
              100
            );

            return (
              <div key={service.agent_id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300 capitalize">
                    {service.agent_id.replace(/-/g, ' ')}
                  </span>
                  <span className="text-gray-400">{service.count} jobs</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 1, delay: 0.5 + idx * 0.1 }}
                    className="h-full bg-gradient-to-r from-[#00FFFF] to-[#D4AF37]"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Activity Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
        <div className="space-y-4">
          {/* Mock activity items - replace with real data */}
          {[
            { time: '2m ago', action: 'Generated video', status: 'completed' },
            { time: '15m ago', action: 'Created avatar', status: 'completed' },
            { time: '1h ago', action: 'Text generation', status: 'completed' },
            { time: '2h ago', action: 'Voice synthesis', status: 'completed' },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 + idx * 0.1 }}
              className="flex items-center gap-4"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  item.status === 'completed' ? 'bg-green-400' : 'bg-yellow-400'
                }`}
              />
              <div className="flex-1">
                <p className="text-sm text-white">{item.action}</p>
                <p className="text-xs text-gray-400">{item.time}</p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  item.status === 'completed'
                    ? 'bg-green-400/20 text-green-400'
                    : 'bg-yellow-400/20 text-yellow-400'
                }`}
              >
                {item.status}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
