/**
 * Worker Heartbeat
 * Upserts worker status to worker_heartbeat table at regular intervals.
 */

import { supabase } from './supabaseClient'
import { structuredLog } from './logger'
import type { WorkerConfig } from './types'

export function startHeartbeat(config: WorkerConfig): void {
  const upsert = async () => {
    try {
      await supabase.from('worker_heartbeat').upsert(
        {
          worker_id: config.workerId,
          worker_type: config.workerType,
          agent_ids: config.supportedAgents,
          status: 'idle',
          last_seen_at: new Date().toISOString(),
          version: process.env.npm_package_version ?? '0.0.0',
        },
        { onConflict: 'worker_id' }
      )
    } catch (err) {
      structuredLog('error', 'heartbeat_failed', {
        error: (err as Error).message,
        workerId: config.workerId,
      })
    }
  }

  // Initial heartbeat
  upsert()

  // Periodic heartbeat
  setInterval(upsert, config.heartbeatIntervalMs)
}
