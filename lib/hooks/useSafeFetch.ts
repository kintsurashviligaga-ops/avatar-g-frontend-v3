"use client";

import { useState, useCallback } from 'react';
import { api, APIError } from '@/lib/apiClient';
import { toast } from '@/lib/toast';

interface UseSafeFetchOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: APIError) => void;
  showToast?: boolean;
}

export function useSafeFetch<T = any>(options: UseSafeFetchOptions<T> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<APIError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const execute = useCallback(
    async (endpoint: string, fetchOptions?: RequestInit) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await api.post<T>(endpoint, fetchOptions?.body ? JSON.parse(fetchOptions.body as string) : undefined);
        
        setData(result);
        options.onSuccess?.(result);
        
        if (options.showToast) {
          toast.success('Request successful');
        }

        return result;
      } catch (err: any) {
        const apiError = err instanceof APIError ? err : new APIError(500, 'UNKNOWN_ERROR', err.message);
        
        setError(apiError);
        options.onError?.(apiError);
        
        if (options.showToast) {
          toast.error(apiError.message);
        }

        throw apiError;
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  return {
    data,
    error,
    isLoading,
    execute,
  };
}
