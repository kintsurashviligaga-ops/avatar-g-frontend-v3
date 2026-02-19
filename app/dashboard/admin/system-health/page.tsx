'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Activity,
  Webhook,
  CreditCard,
  Shield,
  Clock
} from 'lucide-react'

interface HealthCheck {
  name: string
  status: 'healthy' | 'degraded' | 'down'
  message: string
  lastCheck: string
  responseTime?: number
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'down'
  checks: HealthCheck[]
  envVars: {
    name: string
    present: boolean
    type: 'public' | 'secret'
  }[]
  metrics: {
    marginViolations: number
    webhookQueueSize: number
    paymentQueueSize: number
    avgApiResponseMs: number
  }
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkSystemHealth()
    // Refresh every 30 seconds
    const interval = setInterval(checkSystemHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const checkSystemHealth = async () => {
    try {
      // TODO: Call real API endpoint
      // const response = await fetch('/api/admin/system-health')
      // const data = await response.json()

      // Mock data for now
      setHealth({
        overall: 'healthy',
        checks: [
          {
            name: 'Database Connection',
            status: 'healthy',
            message: 'Supabase connection active',
            lastCheck: new Date().toISOString(),
            responseTime: 45,
          },
          {
            name: 'Stripe Webhooks',
            status: 'healthy',
            message: 'Last event received 2 minutes ago',
            lastCheck: new Date().toISOString(),
            responseTime: 120,
          },
          {
            name: 'Payment Processing',
            status: 'healthy',
            message: 'All payment intents successful',
            lastCheck: new Date().toISOString(),
          },
          {
            name: 'API Endpoints',
            status: 'healthy',
            message: 'All endpoints responding',
            lastCheck: new Date().toISOString(),
            responseTime: 89,
          },
          {
            name: 'RLS Policies',
            status: 'healthy',
            message: 'Row-level security active',
            lastCheck: new Date().toISOString(),
          },
          {
            name: 'Margin Guardrails',
            status: 'degraded',
            message: '3 products below 20% floor',
            lastCheck: new Date().toISOString(),
          },
        ],
        envVars: [
          { name: 'NEXT_PUBLIC_SUPABASE_URL', present: true, type: 'public' },
          { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', present: true, type: 'public' },
          { name: 'SUPABASE_SERVICE_ROLE_KEY', present: true, type: 'secret' },
          { name: 'STRIPE_SECRET_KEY', present: true, type: 'secret' },
          { name: 'STRIPE_WEBHOOK_SECRET', present: true, type: 'secret' },
          { name: 'STRIPE_PUBLISHABLE_KEY', present: true, type: 'public' },
        ],
        metrics: {
          marginViolations: 3,
          webhookQueueSize: 0,
          paymentQueueSize: 2,
          avgApiResponseMs: 125,
        },
      })
    } catch (error) {
      console.error('Health check failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: HealthCheck['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-400" />
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />
      case 'down':
        return <XCircle className="w-5 h-5 text-red-400" />
    }
  }

  const getStatusColor = (status: HealthCheck['status']) => {
    switch (status) {
      case 'healthy':
        return 'border-green-500/30 bg-green-500/10'
      case 'degraded':
        return 'border-yellow-500/30 bg-yellow-500/10'
      case 'down':
        return 'border-red-500/30 bg-red-500/10'
    }
  }

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent mb-2">
                System Health Monitor
              </h1>
              <p className="text-gray-400">Real-time platform status and diagnostics</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400">Overall Status</div>
              <div className="flex items-center gap-2">
                {health?.overall === 'healthy' && (
                  <>
                    <CheckCircle className="w-6 h-6 text-green-400" />
                    <span className="text-2xl font-bold text-green-400">Healthy</span>
                  </>
                )}
                {health?.overall === 'degraded' && (
                  <>
                    <AlertTriangle className="w-6 h-6 text-yellow-400" />
                    <span className="text-2xl font-bold text-yellow-400">Degraded</span>
                  </>
                )}
                {health?.overall === 'down' && (
                  <>
                    <XCircle className="w-6 h-6 text-red-400" />
                    <span className="text-2xl font-bold text-red-400">Down</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Health Checks */}
        <Card className="p-6 mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            System Components
          </h2>
          <div className="space-y-3">
            {health?.checks.map((check, idx) => (
              <div
                key={idx}
                className={`p-4 border rounded-lg ${getStatusColor(check.status)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(check.status)}
                    <div>
                      <div className="font-semibold">{check.name}</div>
                      <div className="text-sm text-gray-400">{check.message}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {check.responseTime && (
                      <div className="text-sm text-gray-400">
                        {check.responseTime}ms
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      {new Date(check.lastCheck).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Environment Variables */}
        <Card className="p-6 mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            Environment Configuration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {health?.envVars.map((envVar, idx) => (
              <div
                key={idx}
                className={`p-3 border rounded-lg ${
                  envVar.present
                    ? 'border-green-500/30 bg-green-500/10'
                    : 'border-red-500/30 bg-red-500/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {envVar.present ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-mono text-sm">{envVar.name}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      envVar.type === 'secret'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}
                  >
                    {envVar.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="w-6 h-6 text-yellow-400" />
              <span className="text-2xl font-bold">{health?.metrics.marginViolations}</span>
            </div>
            <div className="text-sm text-gray-400">Margin Violations</div>
            <div className="text-xs text-gray-500 mt-1">Products below 20% floor</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Webhook className="w-6 h-6 text-cyan-400" />
              <span className="text-2xl font-bold">{health?.metrics.webhookQueueSize}</span>
            </div>
            <div className="text-sm text-gray-400">Webhook Queue</div>
            <div className="text-xs text-gray-500 mt-1">Pending events</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <CreditCard className="w-6 h-6 text-green-400" />
              <span className="text-2xl font-bold">{health?.metrics.paymentQueueSize}</span>
            </div>
            <div className="text-sm text-gray-400">Payment Queue</div>
            <div className="text-xs text-gray-500 mt-1">Processing</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-6 h-6 text-purple-400" />
              <span className="text-2xl font-bold">{health?.metrics.avgApiResponseMs}ms</span>
            </div>
            <div className="text-sm text-gray-400">API Response Time</div>
            <div className="text-xs text-gray-500 mt-1">Average (last 5min)</div>
          </Card>
        </div>

        {/* Last Updated */}
        <div className="mt-6 text-center text-sm text-gray-500">
          Last updated: {new Date().toLocaleString()} • Auto-refresh every 30s
        </div>
      </div>
    </div>
  )
}
