'use client';

import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ServiceId } from '@/lib/registry';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadedMedia {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  size: number;
  dataUrl: string;   // full data:mime;base64,... for preview + sending
  preview?: string;  // image/video thumbnail
}

export interface MediaUploadStepProps {
  service: ServiceId;
  locale?: string;
  onContinue: (files: UploadedMedia[]) => void;
  onSkip: () => void;
}

// ─── Service upload config ────────────────────────────────────────────────────

interface UploadConfig {
  headline: Record<string, string>;
  subline: Record<string, string>;
  accept: string;
  types: Array<{ kind: UploadedMedia['type']; icon: string; label: Record<string, string>; accept: string }>;
  maxFiles: number;
  optional: boolean;
}

const UPLOAD_CONFIGS: Partial<Record<ServiceId, UploadConfig>> = {
  avatar: {
    headline: { ka: 'შენი ფოტო ავატარისთვის', en: 'Your photo for the avatar', ru: 'Ваше фото для аватара' },
    subline:  { ka: 'ატვირთე სელფი ან პორტრეტი — Agent G შენს მსგავს ავატარს შექმნის', en: 'Upload a selfie or portrait — Agent G will create an avatar that looks like you', ru: 'Загрузите селфи или портрет — Agent G создаст аватар, похожий на вас' },
    accept: 'image/*',
    maxFiles: 3,
    optional: true,
    types: [
      { kind: 'image', icon: '🤳', label: { ka: 'სელფი / პორტრეტი', en: 'Selfie / Portrait', ru: 'Селфи / Портрет' }, accept: 'image/*' },
    ],
  },
  video: {
    headline: { ka: 'შენი მასალა ვიდეოსთვის', en: 'Your footage for the video', ru: 'Ваши материалы для видео' },
    subline:  { ka: 'ატვირთე შენი ვიდეო ან ფოტო — Agent G შენ ჩართავს სცენაში', en: 'Upload your video or photo — Agent G will place you in the scene', ru: 'Загрузите видео или фото — Agent G вставит вас в сцену' },
    accept: 'image/*,video/*',
    maxFiles: 3,
    optional: true,
    types: [
      { kind: 'video', icon: '🎥', label: { ka: 'ვიდეო კლიპი', en: 'Video clip', ru: 'Видеоклип' }, accept: 'video/*' },
      { kind: 'image', icon: '🖼️', label: { ka: 'საცნობარო ფოტო', en: 'Reference photo', ru: 'Референс фото' }, accept: 'image/*' },
    ],
  },
  image: {
    headline: { ka: 'საცნობარო სურათი (სურვილისამებრ)', en: 'Reference image (optional)', ru: 'Референсное изображение (опционально)' },
    subline:  { ka: 'ატვირთე სტილი, კომპოზიცია ან ობიექტი — Agent G შენს იდეას გამოიყენებს', en: 'Upload a style, composition or subject — Agent G will use your vision', ru: 'Загрузите стиль, композицию или объект — Agent G использует вашу идею' },
    accept: 'image/*',
    maxFiles: 2,
    optional: true,
    types: [
      { kind: 'image', icon: '🎨', label: { ka: 'სტილის საცნობარო', en: 'Style reference', ru: 'Стилевой референс' }, accept: 'image/*' },
    ],
  },
  music: {
    headline: { ka: 'შენი ხმა მუსიკისთვის', en: 'Your voice for the music', ru: 'Ваш голос для музыки' },
    subline:  { ka: 'ატვირთე ხმის ჩაწერა ან ჰუმინგი — Agent G შენს ხმაზე ადაპტირებს ჟღერადობას', en: 'Upload a voice recording or humming — Agent G will adapt the sound to your voice', ru: 'Загрузите запись голоса или мелодию — Agent G адаптирует звук под ваш голос' },
    accept: 'audio/*,video/*',
    maxFiles: 1,
    optional: true,
    types: [
      { kind: 'audio', icon: '🎤', label: { ka: 'ხმის ჩაწერა', en: 'Voice recording', ru: 'Запись голоса' }, accept: 'audio/*' },
      { kind: 'video', icon: '📹', label: { ka: 'ვიდეო ხმით', en: 'Video with voice', ru: 'Видео с голосом' }, accept: 'video/*' },
    ],
  },
  interior: {
    headline: { ka: 'შენი სივრცის ფოტო', en: 'Photo of your space', ru: 'Фото вашего пространства' },
    subline:  { ka: 'ატვირთე შენი ოთახის ფოტო — Agent G ამ სივრცეს გარდაქმნის', en: 'Upload a photo of your room — Agent G will redesign this space', ru: 'Загрузите фото вашей комнаты — Agent G преобразит это пространство' },
    accept: 'image/*',
    maxFiles: 3,
    optional: true,
    types: [
      { kind: 'image', icon: '🏠', label: { ka: 'ოთახის ფოტო', en: 'Room photo', ru: 'Фото комнаты' }, accept: 'image/*' },
    ],
  },
  game: {
    headline: { ka: 'საცნობარო მასალები (სურვილისამებრ)', en: 'Reference materials (optional)', ru: 'Референсные материалы (опционально)' },
    subline:  { ka: 'ატვირთე სქემა, ესქიზი ან მექანიკის აღწერა', en: 'Upload a diagram, sketch or mechanics description', ru: 'Загрузите схему, набросок или описание механики' },
    accept: 'image/*,.pdf,.txt,.md',
    maxFiles: 3,
    optional: true,
    types: [
      { kind: 'image',    icon: '🎮', label: { ka: 'ესქიზი / სქემა', en: 'Sketch / Diagram', ru: 'Набросок / Схема' }, accept: 'image/*' },
      { kind: 'document', icon: '📄', label: { ka: 'დოკუმენტი',       en: 'Document',        ru: 'Документ'        }, accept: '.pdf,.txt,.md' },
    ],
  },
  terminal: {
    headline: { ka: 'კოდის ფაილები (სურვილისამებრ)', en: 'Code files (optional)', ru: 'Файлы кода (опционально)' },
    subline:  { ka: 'ატვირთე არსებული კოდი ან მოთხოვნა — Agent G გააფართოებს', en: 'Upload existing code or a spec — Agent G will extend it', ru: 'Загрузите существующий код или ТЗ — Agent G расширит его' },
    accept: '.ts,.tsx,.js,.jsx,.py,.go,.rs,.txt,.md,.json',
    maxFiles: 5,
    optional: true,
    types: [
      { kind: 'document', icon: '💻', label: { ka: 'კოდის ფაილი', en: 'Code file', ru: 'Файл кода' }, accept: '.ts,.tsx,.js,.jsx,.py,.go,.rs' },
      { kind: 'document', icon: '📋', label: { ka: 'სპეკი / TZ',  en: 'Spec / TZ',  ru: 'Спек / ТЗ'   }, accept: '.txt,.md,.json' },
    ],
  },
  'prompt-builder': {
    headline: { ka: 'კონტექსტური ფაილები (სურვილისამებრ)', en: 'Context files (optional)', ru: 'Контекстные файлы (опционально)' },
    subline:  { ka: 'ატვირთე სურათი ან ტექსტი — Agent G prompt-ს ამის მიხედვით ააწყობს', en: 'Upload an image or text — Agent G will tailor the prompt to it', ru: 'Загрузите изображение или текст — Agent G адаптирует промпт к нему' },
    accept: 'image/*,.txt,.md',
    maxFiles: 2,
    optional: true,
    types: [
      { kind: 'image',    icon: '🖼️', label: { ka: 'სურათი',    en: 'Image',    ru: 'Изображение' }, accept: 'image/*' },
      { kind: 'document', icon: '📝', label: { ka: 'ტექსტი',    en: 'Text',     ru: 'Текст'        }, accept: '.txt,.md' },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectType(mime: string): UploadedMedia['type'] {
  if (mime.startsWith('image/'))       return 'image';
  if (mime.startsWith('video/'))       return 'video';
  if (mime.startsWith('audio/'))       return 'audio';
  return 'document';
}

async function readFile(file: File): Promise<UploadedMedia> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({
        id: uid(),
        name: file.name,
        mimeType: file.type,
        type: detectType(file.type),
        size: file.size,
        dataUrl,
        preview: file.type.startsWith('image/') ? dataUrl : undefined,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({
  accept,
  onFiles,
  maxFiles,
  currentCount,
  locale,
}: {
  accept: string;
  onFiles: (files: File[]) => void;
  maxFiles: number;
  currentCount: number;
  locale: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).slice(0, maxFiles - currentCount);
    if (files.length) onFiles(files);
  }, [onFiles, maxFiles, currentCount]);

  const dropLabel = locale === 'ka'
    ? 'გადმოათრიე ფაილი ან დააჭირე'
    : locale === 'ru' ? 'Перетащите файл или нажмите'
    : 'Drag a file or click';

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-all',
        dragging
          ? 'border-cyan-400/60 bg-cyan-400/10'
          : 'border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={maxFiles > 1}
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? []).slice(0, maxFiles - currentCount);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
      <span className="text-2xl">{dragging ? '📂' : '📎'}</span>
      <p className="text-xs text-white/50">{dropLabel}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MediaUploadStep({ service, locale = 'ka', onContinue, onSkip }: MediaUploadStepProps) {
  const [files, setFiles] = useState<UploadedMedia[]>([]);
  const [loading, setLoading] = useState(false);

  const config = UPLOAD_CONFIGS[service];
  if (!config) {
    // Service doesn't need uploads → skip immediately
    onSkip();
    return null;
  }

  const headline = config.headline[locale] ?? config.headline['en'];
  const subline  = config.subline[locale]  ?? config.subline['en'];

  const continueLabel = locale === 'ka' ? 'გაგრძელება' : locale === 'ru' ? 'Продолжить' : 'Continue';
  const skipLabel     = locale === 'ka' ? 'გამოტოვება' : locale === 'ru' ? 'Пропустить'  : 'Skip';
  const removeLabel   = locale === 'ka' ? 'წაშლა'      : locale === 'ru' ? 'Удалить'      : 'Remove';
  const filesAddedLabel = locale === 'ka'
    ? `${files.length} ფაილი დამატებულია`
    : locale === 'ru' ? `Добавлено ${files.length} файл(а)`
    : `${files.length} file${files.length !== 1 ? 's' : ''} added`;

  const handleFiles = async (rawFiles: File[]) => {
    if (loading) return;
    setLoading(true);
    try {
      const processed = await Promise.all(rawFiles.map(readFile));
      setFiles(prev => [...prev, ...processed].slice(0, config.maxFiles));
    } finally {
      setLoading(false);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white/90">{headline}</p>
          <p className="mt-0.5 text-xs text-white/50">{subline}</p>
        </div>
        {config.optional && (
          <button
            type="button"
            onClick={onSkip}
            className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[10px] text-white/40 transition hover:border-white/20 hover:text-white/60"
          >
            {skipLabel}
          </button>
        )}
      </div>

      {/* Type quick-pick buttons */}
      <div className="mb-3 flex flex-wrap gap-2">
        {config.types.map(t => {
          const label = t.label[locale] ?? t.label['en'];
          return (
            <label key={t.kind + t.accept} className="cursor-pointer">
              <input
                type="file"
                accept={t.accept}
                multiple={config.maxFiles > 1}
                className="hidden"
                onChange={e => {
                  const f = Array.from(e.target.files ?? []);
                  if (f.length) void handleFiles(f);
                  e.target.value = '';
                }}
              />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-200">
                {t.icon} {label}
              </span>
            </label>
          );
        })}
      </div>

      {/* Drop zone */}
      {files.length < config.maxFiles && (
        <DropZone
          accept={config.accept}
          onFiles={f => void handleFiles(f)}
          maxFiles={config.maxFiles}
          currentCount={files.length}
          locale={locale}
        />
      )}

      {/* Uploaded file previews */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 space-y-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {filesAddedLabel}
            </p>
            {files.map(f => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2"
              >
                {/* Thumbnail or icon */}
                {f.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.preview} alt={f.name} className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.06] text-xl">
                    {f.type === 'audio' ? '🎵' : f.type === 'video' ? '🎬' : '📄'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white/80">{f.name}</p>
                  <p className="text-[10px] text-white/40">{formatSize(f.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="shrink-0 rounded-lg px-2 py-1 text-[10px] text-rose-400/70 transition hover:bg-rose-400/10 hover:text-rose-300"
                >
                  {removeLabel}
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Continue button */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => onContinue(files)}
        className={cn(
          'mt-4 w-full rounded-xl py-2.5 text-sm font-semibold transition',
          files.length > 0
            ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-black shadow-[0_0_16px_rgba(34,211,238,0.35)]'
            : 'border border-white/10 bg-white/[0.04] text-white/60 hover:border-white/20 hover:text-white/80',
        )}
      >
        {files.length > 0
          ? `${continueLabel} (${files.length} ${locale === 'ka' ? 'ფაილი' : locale === 'ru' ? 'файл(а)' : 'file(s)'})`
          : continueLabel}
      </motion.button>
    </motion.div>
  );
}
