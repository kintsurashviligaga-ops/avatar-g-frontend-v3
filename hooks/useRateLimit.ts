'use client';

import { useState, useEffect, useCallback } from 'react';

export interface RateLimitStatus {
  count: number;
  limit: number;
  remaining: number | null; // null = unlimited
  unlimited: boolean;
  planId: string;
  isAtLimit: boolean;
  isNearLimit: boolean;
  loading: boolean;
  error: string | null;
  /** Call after each generation to bump count locally without re-fetching */
  incrementCount: () => void;
  /** Force re-fetch from API */
  refresh: () => void;
}

const CACHE_KEY = 'avatar_g_rate_limit';
const CACHE_TTL_MS = 60_000; // 1 minute

export function useRateLimit(isAuthenticated: boolean): RateLimitStatus {
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState(50);
  const [remaining, setRemaining] = useState<number | null>(50);
  const [unlimited, setUnlimited] = useState(false);
  const [planId, setPlanId] = useState('starter');
  const [isAtLimit, setIsAtLimit] = useState(false);
  const [isNearLimit, setIsNearLimit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyData = useCallback((data: Omit<RateLimitStatus, 'loading' | 'error' | 'incrementCount' | 'refresh'>) => {
    setCount(data.count);
    setLimit(data.limit);
    setRemaining(data.remaining);
    setUnlimited(data.unlimited);
    setPlanId(data.planId);
    setIsAtLimit(data.isAtLimit);
    setIsNearLimit(data.isNearLimit);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      // Check cache first
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: ReturnType<typeof Object.assign>; ts: number };
        if (Date.now() - ts < CACHE_TTL_MS) {
          applyData(data);
          setLoading(false);
          return;
        }
      }

      const res = await fetch('/api/rate-limit/daily', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      applyData(data);

      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rate limit');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, applyData]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const incrementCount = useCallback(() => {
    setCount(prev => {
      const next = prev + 1;
      setRemaining(r => (r === null ? null : Math.max(0, r - 1)));
      if (limit > 0) {
        setIsAtLimit(next >= limit);
        setIsNearLimit(!isAtLimit && next >= limit * 0.8);
      }
      // Invalidate cache so next fetch gets fresh data
      sessionStorage.removeItem(CACHE_KEY);
      return next;
    });
  }, [limit, isAtLimit]);

  const refresh = useCallback(() => {
    sessionStorage.removeItem(CACHE_KEY);
    fetchStatus();
  }, [fetchStatus]);

  return {
    count,
    limit,
    remaining,
    unlimited,
    planId,
    isAtLimit,
    isNearLimit,
    loading,
    error,
    incrementCount,
    refresh,
  };
}
