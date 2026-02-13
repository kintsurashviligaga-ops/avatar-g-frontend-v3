'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { 
  Users, 
  ShoppingBag, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Activity
} from 'lucide-react'

interface PlatformMetrics {
  totalGMV: number
  platformRevenue: number
  activeSellers: number
  totalProducts: number
  totalOrders: number
  marginCompliance: number
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Fetch real metrics from API
    setMetrics({
      totalGMV: 125000,
      platformRevenue: 6250,
      activeSellers: 24,
      totalProducts: 156,
      totalOrders: 342,
      marginCompliance: 96.5,
    })
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#05070A] text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Admin Dashboard
          </h1>
          <p className="text-gray-400">Platform overview and system health</p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/20">
            <div className="flex items-center justify-between mb-4">
              <DollarSign className="w-8 h-8 text-cyan-400" />
              <span className="text-sm textgray-400">Today</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              ₾{metrics?.totalGMV.toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">Platform GMV</div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="w-8 h-8 text-green-400" />
              <span className="text-sm text-gray-400">Revenue</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              ₾{metrics?.platformRevenue.toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">Platform Revenue</div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
            <div className="flex items-center justify-between mb-4">
              <Users className="w-8 h-8 text-purple-400" />
              <span className="text-sm text-gray-400">Active</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {metrics?.activeSellers}
            </div>
            <div className="text-sm text-gray-400">Sellers</div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20">
            <div className="flex items-center justify-between mb-4">
              <ShoppingBag className="w-8 h-8 text-orange-400" />
              <span className="text-sm text-gray-400">Catalog</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {metrics?.totalProducts}
            </div>
            <div className="text-sm text-gray-400">Products</div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/20">
            <div className="flex items-center justify-between mb-4">
              <Activity className="w-8 h-8 text-blue-400" />
              <span className="text-sm text-gray-400">Today</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {metrics?.totalOrders}
            </div>
            <div className="text-sm text-gray-400">Orders</div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-green-500/10 to-teal-500/10 border-green-500/20">
            <div className="flex items-center justify-between mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
              <span className="text-sm text-gray-400">Compliance</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {metrics?.marginCompliance}%
            </div>
            <div className="text-sm text-gray-400">Margin Compliance</div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Link href="/dashboard/admin/payouts">
            <Card className="p-6 hover:border-cyan-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <DollarSign className="w-6 h-6 text-cyan-400" />
                <div>
                  <div className="font-semibold">Manage Payouts</div>
                  <div className="text-sm text-gray-400">Approve requests</div>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/dashboard/admin/system-health">
            <Card className="p-6 hover:border-green-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-green-400" />
                <div>
                  <div className="font-semibold">System Health</div>
                  <div className="text-sm text-gray-400">Monitor status</div>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/admin/analytics">
            <Card className="p-6 hover:border-purple-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-purple-400" />
                <div>
                  <div className="font-semibold">Analytics</div>
                  <div className="text-sm text-gray-400">Deep insights</div>
                </div>
              </div>
            </Card>
          </Link>

          <Card className="p-6 hover:border-orange-500/50 transition-all cursor-pointer opacity-60">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-orange-400" />
              <div>
                <div className="font-semibold">Sellers</div>
                <div className="text-sm text-gray-400">Coming soon</div>
              </div>
            </div>
          </Card>
        </div>

        {/* System Alerts */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            Recent Alerts
          </h2>
          <div className="space-y-3">
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-yellow-400">3 Margin Violations</div>
                  <div className="text-sm text-gray-400">Products below 20% margin floor</div>
                </div>
                <button className="text-xs px-3 py-1 bg-yellow-500/20 rounded hover:bg-yellow-500/30 transition-colors">
                  Review
                </button>
              </div>
            </div>

            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-green-400">All Systems Operational</div>
                  <div className="text-sm text-gray-400">Webhooks, payments, and API healthy</div>
                </div>
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
