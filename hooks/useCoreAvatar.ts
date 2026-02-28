'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'

/**
 * Core avatar response shape from /api/avatar/core
 */
interface CoreAvatarResponse {
  id: string
  glb_url: string | null
  poster_url: string | null
  display_name: string | null
  height_cm: number | null
  body_type: string | null
}

/**
 * useCoreAvatar — Realtime core avatar updates.
 * Fetches the user's core avatar on mount and subscribes to
 * profile changes (core_avatar_id) via Supabase Realtime.
 */
export function useCoreAvatar(userId: string | null) {
  const [coreAvatar, setCoreAvatar] = useState<CoreAvatarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserClient()

  // Initial fetch
  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetch('/api/avatar/core')
      .then((r) => r.json())
      .then((data) => {
        setCoreAvatar(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userId])

  // Realtime: listen for profile core_avatar_id changes
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`core-avatar-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        () => {
          // Re-fetch from API (performs join with avatar_assets table)
          fetch('/api/avatar/core')
            .then((r) => r.json())
            .then(setCoreAvatar)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  return { coreAvatar, loading }
}
