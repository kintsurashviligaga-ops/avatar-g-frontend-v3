// Hook: useJob - Poll job status with auto-refresh

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Job } from '@/types/platform';
import { getAccessToken } from '@/lib/auth/client';

interface UseJobOptions {
  jobId?: string;
  pollInterval?: number; // milliseconds
  onComplete?: (job: Job) => void;
  onError?: (error: string) => void;
}

interface UseJobResult {
  job: Job | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useJob({
  jobId,
  pollInterval = 500,
  onComplete,
  onError
}: UseJobOptions = {}): UseJobResult {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout>();

  const fetchJob = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);

        const token = await getAccessToken();
        if (!token) {
          setError('No auth token');
          return;
        }

        const response = await fetch(`/api/jobs/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch job');
        }

        const data = await response.json();
        const jobData = data.job || data;
        setJob(jobData);

        // Check if job is complete
        if (jobData.status === 'done' || jobData.status === 'completed') {
          onComplete?.(jobData);
          clearTimeout(pollTimeoutRef.current);
        } else if (jobData.status === 'error') {
          setError(jobData.error || 'Job failed');
          onError?.(jobData.error || 'Job failed');
          clearTimeout(pollTimeoutRef.current);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        onError?.(message);
      } finally {
        setLoading(false);
      }
    },
    [onComplete, onError]
  );

  // Start polling when jobId is set
  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      await fetchJob(jobId);
      // Schedule next poll only if job is not complete
      if (!job || (job.status !== 'done' && job.status !== 'error')) {
        pollTimeoutRef.current = setTimeout(poll, pollInterval);
      }
    };

    poll();

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, [jobId, job, fetchJob, pollInterval]);

  return {
    job,
    loading,
    error,
    refetch: () => (jobId ? fetchJob(jobId) : Promise.resolve())
  };
}
