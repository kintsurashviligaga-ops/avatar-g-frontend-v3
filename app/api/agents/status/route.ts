import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId')

  if (!agentId) {
    return NextResponse.json({ status: 'offline' })
  }

  // Agent status is determined by checking if the worker has a recent heartbeat.
  // Since we may not have a worker_heartbeat table yet, we return a default status.
  // In production with active workers, this will query Supabase for live heartbeats.
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const cutoff = new Date(Date.now() - 60_000).toISOString() // 60s heartbeat window

    const { data } = await supabase
      .from('worker_heartbeat')
      .select('status, current_job_id')
      .contains('agent_ids', [agentId])
      .gte('last_seen_at', cutoff)
      .limit(1)
      .single()

    if (!data) return NextResponse.json({ status: 'offline' })

    const status = data.status === 'idle' ? 'online'
      : data.status === 'busy' ? 'busy'
      : 'offline'

    return NextResponse.json({ status, worker_status: data.status })
  } catch {
    // If table doesn't exist or query fails, return offline gracefully
    return NextResponse.json({ status: 'offline' })
  }
}
