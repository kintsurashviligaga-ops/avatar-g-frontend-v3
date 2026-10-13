'use client';
import { useEffect, useState } from 'react';
import { imageApi, type ImageAccess } from '@/lib/image/studio/client';
export function useImageStudioAccess(enabled: boolean) {
  const [access, setAccess] = useState<ImageAccess | null>(null);
  useEffect(() => {
    if (!enabled) { setAccess(null); return; }
    const ctl = new AbortController();
    void imageApi<ImageAccess>('/api/image/models', undefined, ctl.signal)
      .then(value => { if (!ctl.signal.aborted && value.userId && value.models.length) setAccess(value); })
      .catch(() => { if (!ctl.signal.aborted) setAccess(null); });
    return () => ctl.abort();
  }, [enabled]);
  return access;
}
