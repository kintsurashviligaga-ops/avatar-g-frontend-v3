"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Job, JobStatus } from '@/lib/types/job';
import { api } from '@/lib/apiClient';

interface UseJobPollerOptions {
  jobId: string | null;
  serviceType: string;
  interval?: number;
  onComplete?: (job: Job) => void;
  onError?: (error: any) => void;
}

export function useJobPoller({
  jobId,
  serviceType,
  interval = 2000,
  onComplete,
  onError,
}: UseJobPollerOptions) {
  const [job, setJob] = useState<Job | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();
  const mountedRef = useRef(true);

  const pollJob = useCallback(async () => {
    if (!jobId || !mountedRef.current) return;

    try {
      const data = await api.get<Job>(`/api/${serviceType}/status?jobId=${jobId}`);
      
      if (!mountedRef.current) return;
      
      setJob(data);

      if (data.status === 'completed') {
        setIsPolling(false);
        onComplete?.(data);
      } else if (data.status === 'error') {
        setIsPolling(false);
        onError?.(new Error(data.error_message || 'Job failed'));
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setIsPolling(false);
      onError?.(error);
    }
  }, [jobId, serviceType, onComplete, onError]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (jobId && isPolling) {
      pollJob(); // Immediate first poll
      intervalRef.current = setInterval(pollJob, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [jobId, isPolling, interval, pollJob]);

  const startPolling = useCallback(() => {
    setIsPolling(true);
  }, []);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);

  return {
    job,
    isPolling,
    startPolling,
    stopPolling,
  };
}
