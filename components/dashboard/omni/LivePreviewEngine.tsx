'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Download, Film, ImageIcon, Mic2, Music2, PlayCircle, TextCursorInput, Workflow } from 'lucide-react';
import { useOmniDashboardStore } from './store';
import { getLocalizedService, normalizeOmniLocale } from './i18n';
import type { PreviewArtifact } from './types';
import { formatClock } from './utils';

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(fileName: string, dataUrl: string) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function AudioMeter() {
  const bars = [24, 38, 52, 44, 64, 36, 58, 42, 50, 30, 68, 48];
  return (
    <div className="grid grid-cols-12 gap-1">
      {bars.map((height, index) => (
        <motion.span
          key={`${height}-${index}`}
          className="rounded-sm bg-cyan-200/80"
          style={{ height: `${height}px` }}
          animate={{ opacity: [0.4, 1, 0.4], y: [0, -2, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, delay: index * 0.07 }}
        />
      ))}
    </div>
  );
}

function resolveIcon(kind: PreviewArtifact['kind']) {
  if (kind === 'image') return ImageIcon;
  if (kind === 'video') return Film;
  if (kind === 'audio') return Music2;
  if (kind === 'workflow') return Workflow;
  return TextCursorInput;
}

const PREVIEW_COPY = {
  ka: {
    title: 'ცოცხალი პრევიუ',
    export: 'ექსპორტი',
    empty: 'გაუშვი ნებისმიერი სერვისი და შედეგი აქ რეალურ დროში გამოჩნდება.',
    timeline: 'რეალურ დროში სცენარის დროითი ხაზი',
    timelineFallback: 'სცენების გრაფი სინქრონიზებულია გამოსახულებასა და ხმასთან.',
    vu: 'ანალოგური VU მონიტორი',
    audioFallback: 'აუდიო გენერაცია აქტიურია.',
    recent: 'ბოლო შედეგები',
    noAssets: 'ჯერ არცერთი არტეფაქტი არაა გენერირებული.',
    imageGenerating: 'სურათი იქმნება...',
  },
  en: {
    title: 'Live Preview Engine',
    export: 'Export',
    empty: 'Run any worker to stream output in this pane.',
    timeline: 'Real-time storyboard timeline',
    timelineFallback: 'Scene graph synchronized with image and voice references.',
    vu: 'Analog VU monitor',
    audioFallback: 'Audio render online.',
    recent: 'Recent Outputs',
    noAssets: 'No assets generated yet.',
    imageGenerating: 'Generating image...',
  },
  ru: {
    title: 'Живое превью',
    export: 'Экспорт',
    empty: 'Запусти любой сервис, и результат появится здесь в реальном времени.',
    timeline: 'Временная шкала сториборда в реальном времени',
    timelineFallback: 'Граф сцен синхронизирован с изображением и голосом.',
    vu: 'Аналоговый VU-монитор',
    audioFallback: 'Аудиорендер выполняется.',
    recent: 'Последние результаты',
    noAssets: 'Пока нет сгенерированных артефактов.',
    imageGenerating: 'Генерация изображения...',
  },
} as const;

export function LivePreviewEngine() {
  const preview = useOmniDashboardStore((state) => state.preview);
  const sharedAssets = useOmniDashboardStore((state) => state.sharedAssets);
  const focusPreview = useOmniDashboardStore((state) => state.focusPreview);
  const locale = useOmniDashboardStore((state) => state.locale);

  const localeCode = normalizeOmniLocale(locale);
  const copy = PREVIEW_COPY[localeCode];

  const recentAssets = useMemo(() => sharedAssets.slice(0, 6), [sharedAssets]);

  const exportCurrent = () => {
    if (!preview) return;
    const normalizedTitle = preview.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const fileSafe = normalizedTitle || `asset-${preview.id.slice(0, 8)}`;

    if (preview.kind === 'image' && preview.sourceUrl) {
      downloadDataUrl(`${fileSafe}.svg`, preview.sourceUrl);
      return;
    }

    if (preview.textBody) {
      downloadTextFile(`${fileSafe}.txt`, preview.textBody);
      return;
    }

    const fallback = JSON.stringify(preview, null, 2);
    downloadTextFile(`${fileSafe}.json`, fallback);
  };

  const previewIcon = preview ? resolveIcon(preview.kind) : PlayCircle;
  const PreviewIcon = previewIcon;

  return (
    <section className="omni-pane omni-preview-pane flex min-h-0 flex-col rounded-2xl border p-3 sm:p-4">
      <header className="mb-3 flex items-center gap-3 border-b border-white/10 pb-3">
        <PreviewIcon className="h-4 w-4 text-cyan-200" />
        <p className="omni-title text-sm font-semibold text-white">{copy.title}</p>
        <button
          type="button"
          onClick={exportCurrent}
          disabled={!preview}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[11px] font-medium text-cyan-100/90 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Download className="h-3.5 w-3.5" />
          {copy.export}
        </button>
      </header>

      <div className="omni-preview-canvas min-h-[220px] flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/25 p-3">
        {!preview ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <PlayCircle className="h-10 w-10 text-cyan-200/45" />
            <p className="text-sm text-white/62">{copy.empty}</p>
          </div>
        ) : (
          <motion.div
            key={preview.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{preview.title}</p>
                <p className="text-xs text-white/55">{getLocalizedService(preview.serviceId, localeCode).title}</p>
              </div>
              <p className="font-mono text-[11px] text-white/45">{formatClock(preview.createdAt)}</p>
            </div>

            {preview.kind === 'image' && preview.sourceUrl && (
              <Image
                src={preview.sourceUrl}
                alt={preview.title}
                width={600}
                height={800}
                unoptimized
                className="h-[220px] w-full rounded-lg object-cover"
              />
            )}

            {preview.kind === 'image' && !preview.sourceUrl && (
              <div className="flex h-[220px] flex-col items-center justify-center gap-3 rounded-lg border border-white/10 bg-slate-900/60">
                <motion.div
                  className="h-8 w-8 rounded-full border-2 border-cyan-300/40 border-t-cyan-300"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <p className="text-xs text-white/55">{copy.imageGenerating}</p>
              </div>
            )}

            {preview.kind === 'video' && (
              preview.sourceUrl ? (
                <video
                  src={preview.sourceUrl}
                  controls
                  autoPlay
                  loop
                  className="h-[220px] w-full rounded-lg object-contain bg-black"
                />
              ) : (
                <div className="flex h-[220px] flex-col justify-between rounded-lg border border-white/10 bg-slate-900/60 p-3">
                  <div className="flex items-center gap-2 text-white/75">
                    <Film className="h-4 w-4" />
                    <span className="text-xs">{copy.timeline}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-cyan-300/70"
                        animate={{ width: ['16%', '76%', '34%'] }}
                        transition={{ duration: 3.2, repeat: Infinity }}
                      />
                    </div>
                    <p className="text-xs text-white/55">{copy.timelineFallback}</p>
                  </div>
                </div>
              )
            )}

            {preview.kind === 'audio' && (
              <div className="space-y-3 rounded-lg border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center gap-2 text-white/75">
                  <Mic2 className="h-4 w-4" />
                  <span className="text-xs">{copy.vu}</span>
                </div>
                <AudioMeter />
                <p className="text-xs text-white/55">{preview.textBody ?? copy.audioFallback}</p>
              </div>
            )}

            {(preview.kind === 'text' || preview.kind === 'workflow') && (
              <pre className="h-[220px] overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed text-cyan-100/80">
                {preview.textBody ?? preview.summary}
              </pre>
            )}
          </motion.div>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">{copy.recent}</p>
        <div className="grid gap-1.5">
          {recentAssets.length === 0 && <p className="text-xs text-white/45">{copy.noAssets}</p>}
          {recentAssets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => focusPreview(asset.id)}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-left text-xs text-white/74 transition-colors hover:bg-white/[0.08]"
            >
              {asset.title}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
