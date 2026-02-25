import { createElement, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

type ResultStepProps = {
  locale: string;
  modelUrl: string | null;
  posterUrl: string | null;
  status: 'processing' | 'ready';
  isDev: boolean;
  onSimulateReady: () => void;
  onSetCore: () => void;
  onCreateAnother: () => void;
  processingText: string;
};

export function ResultStep({
  locale,
  modelUrl,
  posterUrl,
  status,
  isDev,
  onSimulateReady,
  onSetCore,
  onCreateAnother,
  processingText,
}: ResultStepProps) {
  useEffect(() => {
    if (!modelUrl) return;
    const existing = document.querySelector('script[data-model-viewer="true"]');
    if (existing) return;

    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
    script.setAttribute('data-model-viewer', 'true');
    document.head.appendChild(script);
  }, [modelUrl]);

  const modelViewerProps: Record<string, unknown> = {
    src: modelUrl,
    poster: posterUrl ?? undefined,
    style: { width: '100%', height: '420px', background: '#060B18', borderRadius: '12px' },
    ar: true,
    autoplay: true,
    'camera-controls': true,
    'auto-rotate': true,
    'shadow-intensity': 1,
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
        <p className="font-semibold text-cyan-200">Status: {status}</p>
        {status === 'processing' && <p className="mt-2">{processingText}</p>}
      </div>

      {modelUrl ? (
        <div className="rounded-xl border border-cyan-400/40 bg-cyan-500/5 p-2">
          {typeof window !== 'undefined' && window.customElements.get('model-viewer')
            ? createElement('model-viewer', modelViewerProps)
            : (
              <div className="relative h-[420px] w-full">
                <Image
                  src={posterUrl ?? '/brand/logo.png'}
                  alt="Avatar poster"
                  fill
                  sizes="100vw"
                  className="rounded-lg object-cover"
                />
              </div>
            )}
        </div>
      ) : (
        <div className="relative h-[420px] w-full">
          <Image
            src={posterUrl ?? '/brand/logo.png'}
            alt="Avatar poster"
            fill
            sizes="100vw"
            className="rounded-xl border border-white/10 object-cover"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={onSetCore} variant="primary">Use as Core Avatar</Button>
        <Button onClick={onCreateAnother} variant="outline">Create another version</Button>
        <Link href={`/${locale}/workspace`} className="inline-flex items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10">
          Back to dashboard
        </Link>
        {isDev && (
          <Button onClick={onSimulateReady} variant="secondary">
            Simulate Ready
          </Button>
        )}
      </div>
    </div>
  );
}
