'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Users, Activity, DollarSign, Zap } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { motion } from 'framer-motion';

interface Analytics {
  users: {
    total: number;
    byPlan: Record<string, number>;
    activeToday: number;
  };
  credits: {
    totalSpent: number;
    byService: Record<string, number>;
    averagePerUser: number;
  };
  revenue: {
    mrr: number;
    totalLifetime: number;
    byPlan: Record<string, number>;
  };
  usage: {
    totalJobs: number;
    successRate: number;
    topServices: Array<{ name: string; count: number }>;
  };
}

export default function AdminPanelPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await fetch('/api/admin/analytics');
        if (!response.ok) throw new Error('Failed to load analytics');
        const data = await response.json();
        setAnalytics(data.analytics);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (isLoading) {
    return (
      <main className="relative min-h-screen bg-[#05070A]">
        <SpaceBackground />
        <div className="relative z-10 pt-24 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading analytics...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !analytics) {
    return (
      <main className="relative min-h-screen bg-[#05070A]">
        <SpaceBackground />
        <div className="relative z-10 pt-24 px-4">
          <div className="max-w-7xl mx-auto">
            <Card className="p-12 bg-red-500/10 border-red-500/30 backdrop-blur-sm text-center">
              <p className="text-red-400">{error || 'Failed to load analytics'}</p>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  const stats = [
    {
      label: 'Total Users',
      value: analytics.users.total.toLocaleString(),
      icon: Users,
      color: 'from-cyan-500 to-blue-600',
      change: '+12.5%',
    },
    {
      label: 'Active Today',
      value: analytics.users.activeToday.toLocaleString(),
      icon: Activity,
      color: 'from-green-500 to-emerald-600',
      change: '+8.3%',
    },
    {
      label: 'MRR',
      value: `$${analytics.revenue.mrr.toLocaleString()}`,
      icon: DollarSign,
      color: 'from-amber-500 to-orange-600',
      change: '+15.2%',
    },
    {
      label: 'Total Jobs',
      value: analytics.usage.totalJobs.toLocaleString(),
      icon: Zap,
      color: 'from-purple-500 to-pink-600',
      change: '+23.8%',
    },
  ];

  return (
    <main className="relative min-h-screen bg-[#05070A]">
      <SpaceBackground />
      
      <div className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <h1 className="text-4xl font-bold text-white mb-2">
              Admin <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Analytics</span>
            </h1>
            <p className="text-gray-400">Platform overview and metrics</p>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg bg-gradient-to-br ${stat.color} bg-opacity-10`}>
                      <stat.icon className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-sm text-green-400">{stat.change}</span>
                  </div>
                  <p className="text-sm text-gray-400 mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Detailed Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Users by Plan */}
            <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
              <h3 className="text-xl font-semibold text-white mb-4">Users by Plan</h3>
              <div className="space-y-3">
                {Object.entries(analytics.users.byPlan).map(([plan, count]) => (
                  <div key={plan} className="flex items-center justify-between">
                    <span className="text-gray-300">{plan}</span>
                    <span className="text-white font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Revenue by Plan */}
            <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
              <h3 className="text-xl font-semibold text-white mb-4">Revenue by Plan</h3>
              <div className="space-y-3">
                {Object.entries(analytics.revenue.byPlan).map(([plan, revenue]) => (
                  <div key={plan} className="flex items-center justify-between">
                    <span className="text-gray-300">{plan}</span>
                    <span className="text-white font-semibold">${revenue}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top Services */}
            <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
              <h3 className="text-xl font-semibold text-white mb-4">Top Services</h3>
              <div className="space-y-3">
                {analytics.usage.topServices.map((service, i) => (
                  <div key={service.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-sm">#{i + 1}</span>
                      <span className="text-gray-300">{service.name}</span>
                    </div>
                    <span className="text-white font-semibold">{service.count} jobs</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Credits Usage */}
            <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
              <h3 className="text-xl font-semibold text-white mb-4">Credits Usage</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-400">Total Spent</p>
                  <p className="text-2xl font-bold text-white">{analytics.credits.totalSpent.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Average per User</p>
                  <p className="text-2xl font-bold text-cyan-400">{Math.round(analytics.credits.averagePerUser)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Success Rate</p>
                  <p className="text-2xl font-bold text-green-400">{analytics.usage.successRate}%</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
