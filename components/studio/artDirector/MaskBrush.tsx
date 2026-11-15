'use client';

/**
 * Mask brush (Phase 8.4): paint over the part to change. The painted layer is exported as a PNG (white = change) at the
 * image's own size; the server turns it into a binary mask, shows the model a red guide and pastes the original back
 * outside it when "Keep everything else identical" is on (the default). No brush = a whole-image conversational edit.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Paintbrush, Undo2, Trash2, FlipHorizontal } from 'lucide-react';
import { artLabel, type Lang } from '@/lib/image/artDirector/labels';

export interface MaskSubmit { prompt: string; mask: Blob | null; keepRest: boolean }

const T = {
  brush: { ka: 'ფუნჯი', en: 'Brush', ru: 'Кисть' },
  eraser: { ka: 'საშლელი', en: 'Eraser', ru: 'Ластик' },
  undo: { ka: 'დაბრუნება', en: 'Undo', ru: 'Отменить' },
  clear: { ka: 'გასუფთავება', en: 'Clear', ru: 'Очистить' },
  invert: { ka: 'ინვერსია', en: 'Invert', ru: 'Инвертировать' },
  size: { ka: 'ზომა', en: 'Size', ru: 'Размер' },
  apply: { ka: 'რედაქტირება', en: 'Apply edit', ru: 'Применить' },
} as const;

export function MaskBrush({ imageUrl, width, height, lang, price, onSubmit, onCancel }: {
  imageUrl: string;
  width: number;
  height: number;
  lang: Lang;
  price: number | null;
  onSubmit: (s: MaskSubmit) => void;
  onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<ImageData[]>([]);
  const drawing = useRef(false);
  const [mode, setMode] = useState<'brush' | 'eraser'>('brush');
  const [size, setSize] = useState(Math.round(Math.max(width, height) / 20));
  const [prompt, setPrompt] = useState('');
  const [keepRest, setKeepRest] = useState(true);
  const [painted, setPainted] = useState(false);

  const ctx = () => canvas.current?.getContext('2d') ?? null;
  useEffect(() => { const c = ctx(); if (c) c.clearRect(0, 0, width, height); }, [width, height]);

  const snapshot = () => { const c = ctx(); if (c) history.current = [...history.current.slice(-19), c.getImageData(0, 0, width, height)]; };
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / Math.max(1, r.width)) * width, y: ((e.clientY - r.top) / Math.max(1, r.height)) * height };
  };
  const dab = useCallback((x: number, y: number) => {
    const c = ctx();
    if (!c) return;
    c.globalCompositeOperation = mode === 'brush' ? 'source-over' : 'destination-out';
    c.fillStyle = 'rgba(255,255,255,1)';
    c.beginPath();
    c.arc(x, y, size / 2, 0, Math.PI * 2);
    c.fill();
    if (mode === 'brush') setPainted(true);
  }, [mode, size]);

  const invert = () => {
    const c = ctx();
    if (!c) return;
    snapshot();
    const img = c.getImageData(0, 0, width, height);
    for (let i = 0; i < img.data.length; i += 4) {
      const on = (img.data[i + 3] as number) >= 128;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = on ? 0 : 255;
    }
    c.putImageData(img, 0, 0);
    setPainted(true);
  };

  const submit = () => {
    if (!painted || !canvas.current) { onSubmit({ prompt, mask: null, keepRest }); return; }
    canvas.current.toBlob((b) => onSubmit({ prompt, mask: b, keepRest }), 'image/png');
  };

  const tool = (on: boolean) => `inline-flex min-h-[36px] items-center gap-1 rounded-full border px-3 text-[13px] ${on ? 'border-app-accent bg-app-accent/15 text-app-text' : 'border-app-border/25 text-app-muted'}`;
  return (
    <div data-testid="art-mask-brush" className="space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/45 p-3">
      <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: `${width} / ${height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the image being edited */}
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
        <canvas ref={canvas} width={width} height={height} data-testid="art-mask-canvas"
          className="absolute inset-0 h-full w-full touch-none opacity-50 [image-rendering:pixelated]" style={{ mixBlendMode: 'screen' }}
          onPointerDown={(e) => { drawing.current = true; snapshot(); e.currentTarget.setPointerCapture?.(e.pointerId); const p = at(e); dab(p.x, p.y); }}
          onPointerMove={(e) => { if (!drawing.current) return; const p = at(e); dab(p.x, p.y); }}
          onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={tool(mode === 'brush')} aria-pressed={mode === 'brush'} onClick={() => setMode('brush')}><Paintbrush size={13} /> {T.brush[lang]}</button>
        <button type="button" className={tool(mode === 'eraser')} aria-pressed={mode === 'eraser'} onClick={() => setMode('eraser')}><Eraser size={13} /> {T.eraser[lang]}</button>
        <button type="button" className={tool(false)} onClick={() => { const c = ctx(); const last = history.current.pop(); if (c && last) c.putImageData(last, 0, 0); }}><Undo2 size={13} /> {T.undo[lang]}</button>
        <button type="button" className={tool(false)} onClick={() => { const c = ctx(); if (c) { snapshot(); c.clearRect(0, 0, width, height); } setPainted(false); }}><Trash2 size={13} /> {T.clear[lang]}</button>
        <button type="button" className={tool(false)} onClick={invert}><FlipHorizontal size={13} /> {T.invert[lang]}</button>
        <label className="ml-auto flex items-center gap-2 text-[12px] text-app-muted">{T.size[lang]}
          <input type="range" min={4} max={Math.max(64, Math.round(Math.max(width, height) / 4))} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
      </div>
      <input data-testid="art-mask-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={artLabel('brushPrompt', lang)}
        className="w-full rounded-xl border border-app-border/25 bg-transparent px-3 py-2 text-[14px] text-app-text" />
      <label className="flex items-center gap-2 text-[13px] text-app-text">
        <input type="checkbox" data-testid="art-keep-rest" checked={keepRest} onChange={(e) => setKeepRest(e.target.checked)} />
        {artLabel('keepRest', lang)}
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="inline-flex min-h-[40px] items-center rounded-full border border-app-border/30 px-4 text-[13px] text-app-text">✕</button>
        <button type="button" data-testid="art-mask-apply" disabled={!prompt.trim()} onClick={submit}
          className="inline-flex min-h-[40px] items-center rounded-full bg-app-accent px-4 text-[13px] font-semibold text-app-bg disabled:opacity-50">
          {T.apply[lang]}{price != null ? ` ✦${price}` : ''}
        </button>
      </div>
    </div>
  );
}
