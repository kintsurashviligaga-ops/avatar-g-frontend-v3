'use client';

/**
 * components/service-chat/ServicePreviewPanel.tsx
 * ==================================================
 * Preview display for service outputs: images, video,
 * audio player, formatted text, and workflow diagrams.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ExternalLink, Maximize2 } from 'lucide-react';
import type { PreviewItem, ServiceChatConfig } from './types';

interface Props {
  config: ServiceChatConfig;
  previews: PreviewItem[];
  language: string;
  onClearPreviews: () => void;
}

export function ServicePreviewPanel({ config, previews, language, onClearPreviews }: Props) {
  if (previews.length === 0) return null;

  const latest = previews[previews.length - 1];
  if (!latest) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex-shrink-0 overflow-hidden"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <div className="px-4 py-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold" style={{ color: config.accentColor }}>
              Preview
              {previews.length > 1 && ` (${previews.length})`}
            </span>
            <div className="flex items-center gap-1">
              <button className="p-1 rounded-lg hover:bg-white/5" style={{ color: 'var(--color-text-tertiary)' }}>
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button className="p-1 rounded-lg hover:bg-white/5" style={{ color: 'var(--color-text-tertiary)' }}>
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={onClearPreviews} className="p-1 rounded-lg hover:bg-white/5" style={{ color: 'var(--color-text-tertiary)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <PreviewContent item={latest} accentColor={config.accentColor} />

          {/* Thumbnail strip for multiple */}
          {previews.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {previews.map((p, i) => (
                <div
                  key={p.id}
                  className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden border"
                  style={{
                    borderColor: i === previews.length - 1 ? `${config.accentColor}60` : 'rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                  }}
                >
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {i + 1}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function PreviewContent({ item, accentColor }: { item: PreviewItem; accentColor: string }) {
  switch (item.type) {
    case 'image':
      return (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {item.url ? (
            <img src={item.url} alt={item.title || 'Preview'} className="w-full max-h-[200px] object-contain bg-black/20" />
          ) : (
            <div className="w-full h-[120px] flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--color-text-tertiary)' }}>
              Image preview
            </div>
          )}
        </div>
      );

    case 'video':
      return (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {item.url ? (
            <video controls className="w-full max-h-[200px]" style={{ background: '#000' }}>
              <source src={item.url} />
            </video>
          ) : (
            <div className="w-full h-[120px] flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--color-text-tertiary)' }}>
              🎬 Video preview
            </div>
          )}
        </div>
      );

    case 'audio':
      return (
        <div className="rounded-xl p-3 border" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          {item.url ? (
            <audio controls className="w-full" style={{ height: 36 }}>
              <source src={item.url} />
            </audio>
          ) : (
            <div className="flex items-center justify-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>
              🎵 Audio preview
            </div>
          )}
          {item.title && (
            <p className="text-[11px] mt-2 truncate" style={{ color: 'var(--color-text-secondary)' }}>{item.title}</p>
          )}
        </div>
      );

    case 'text':
      return (
        <div
          className="rounded-xl p-3 border max-h-[160px] overflow-y-auto text-[13px] leading-relaxed"
          style={{
            borderColor: 'rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
            color: 'var(--color-text)',
          }}
        >
          {item.content || 'Text preview'}
        </div>
      );

    case 'workflow':
      return (
        <div
          className="rounded-xl p-3 border"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-2" style={{ color: accentColor }}>
            <span className="text-[12px] font-medium">⚡ Workflow Preview</span>
          </div>
          {item.content && (
            <p className="text-[12px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>{item.content}</p>
          )}
        </div>
      );

    default:
      return null;
  }
}
