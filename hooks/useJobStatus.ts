'use client'

import { useEffect, useState, useRef } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import type { JobRecord } from '@/types/jobs'

const POLL_INTERVAL_MS = 4000
const REALTIME_TIMEOUT_MS = 5000

/**
 * useJobStatus — Realtime job status with polling fallback.
 * Subscribes to Supabase Realtime postgres_changes on the jobs table.
 * Falls back to 4s interval polling if WebSocket fails to connect.
 */
export function useJobStatus(jobId: string | null) {
  const [job, setJob] = useState<JobRecord | null>(null)
  const [transport, setTransport] = useState<'realtime' | 'polling'>('realtime')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const supabase = createBrowserClient()

  // Initial fetch
  useEffect(() => {
    if (!jobId) return
    supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()
      .then(({ data }) => {
        if (data) setJob(data as unknown as JobRecord)
      })
  }, [jobId, supabase])

  // Realtime subscription with polling fallback
  useEffect(() => {
    if (!jobId) return

    let realtimeConnected = false

    const realtimeTimeoutId = setTimeout(() => {
      if (!realtimeConnected) {
        setTransport('polling')
        startPolling()
      }
    }, REALTIME_TIMEOUT_MS)

    const channel = supabase
      .channel(`job-status-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          realtimeConnected = true
          clearTimeout(realtimeTimeoutId)
          setJob(payload.new as unknown as JobRecord)
          setTransport('realtime')
          stopPolling()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeConnected = true
          clearTimeout(realtimeTimeoutId)
        }
      })

    const startPolling = () => {
      if (pollRef.current) return
      pollRef.current = setInterval(async () => {
        const { data } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', jobId)
          .single()
        if (data) setJob(data as unknown as JobRecord)
        if (
          data &&
          ((data as unknown as JobRecord).status === 'completed' ||
            (data as unknown as JobRecord).status === 'dead')
        ) {
          stopPolling()
        }
      }, POLL_INTERVAL_MS)
    }

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    return () => {
      clearTimeout(realtimeTimeoutId)
      stopPolling()
      supabase.removeChannel(channel)
    }
  }, [jobId, supabase])

  return { job, transport }
}
