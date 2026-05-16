'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Package, CheckSquare, Square } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  kind: 'image' | 'video' | 'audio';
  url: string;
  title?: string;
}

interface ExportPackModalProps {
  open: boolean;
  items: MediaItem[];
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extFor(kind: string, url: string): string {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('.mp4') || urlLower.includes('.webm')) return 'mp4';
  if (urlLower.includes('.mp3') || urlLower.includes('.wav') || urlLower.includes('.ogg')) return 'mp3';
  if (urlLower.includes('.webp')) return 'webp';
  if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return 'jpg';
  if (urlLower.includes('.png')) return 'png';
  if (kind === 'video') return 'mp4';
  if (kind === 'audio') return 'mp3';
  return 'jpg';
}

function kindLabel(kind: string): string {
  if (kind === 'image') return '🎨 Image';
  if (kind === 'video') return '🎬 Video';
  if (kind === 'audio') return '🎵 Audio';
  return '📄 File';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ExportPackModal({ open, items, onClose }: ExportPackModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(items.map(i => i.id)));
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'fetching' | 'zipping' | 'done' | 'error'>('idle');

  const toggle = (id: string) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const handleExport = async () => {
    const toExport = items.filter(i => selected.has(i.id));
    if (toExport.length === 0) return;

    try {
      setStatus('fetching');
      setProgress({ fetched: 0, total: toExport.length });

      // Dynamically import JSZip to keep initial bundle small
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();

      let fetched = 0;
      for (const item of toExport) {
        try {
          const res = await fetch(item.url, { mode: 'cors' });
          if (!res.ok) throw new Error('fetch failed');
          const blob = await res.blob();
          const ext = extFor(item.kind, item.url);
          const name = (item.title ?? item.id).replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 60);
          zip.file(`${name}.${ext}`, blob);
        } catch {
          // skip failed items silently
        }
        fetched++;
        setProgress({ fetched, total: toExport.length });
      }

      setStatus('zipping');

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 3 },
      });

      // Trigger download
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `avatar-g-export-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setStatus('done');
      setTimeout(() => {
        setStatus('idle');
        setProgress(null);
        onClose();
      }, 1500);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const selectedCount = selected.size;
  const isRunning = status === 'fetching' || status === 'zipping';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0 0 env(safe-area-inset-bottom,0)',
          }}
          onClick={e => { if (e.target === e.currentTarget && !isRunning) onClose(); }}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            style={{
              width: '100%', maxWidth: 480, maxHeight: '85vh',
              background: '#131318',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px 20px 0 0',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 20px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'linear-gradient(135deg, #7c3aed22, #a855f722)',
                  border: '1px solid rgba(168,85,247,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Package style={{ width: 16, height: 16, color: '#a855f7' }} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Export Pack</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    {selectedCount} / {items.length} მონიშნული
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isRunning}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  opacity: isRunning ? 0.4 : 1,
                }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* Select all */}
            <div style={{ padding: '10px 20px 6px' }}>
              <button
                type="button"
                onClick={toggleAll}
                disabled={isRunning}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: 'none', border: 'none', color: '#a855f7',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                }}
              >
                {selected.size === items.length
                  ? <CheckSquare style={{ width: 15, height: 15 }} />
                  : <Square style={{ width: 15, height: 15, opacity: 0.5 }} />}
                {selected.size === items.length ? 'ყველას მოხსნა' : 'ყველას მონიშვნა'}
              </button>
            </div>

            {/* Item list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 12px' }}>
              {items.map((item) => {
                const isSelected = selected.has(item.id);
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    onClick={() => !isRunning && toggle(item.id)}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      width: '100%',
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px',
                      marginBottom: 6,
                      background: isSelected ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isSelected ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 10,
                      cursor: isRunning ? 'default' : 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                  >
                    {/* Thumbnail */}
                    {item.kind === 'image' ? (
                      <img
                        src={item.url}
                        alt=""
                        style={{ width: 40, height: 40, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: 40, height: 40, borderRadius: 7,
                        background: 'rgba(255,255,255,0.07)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>
                        {item.kind === 'video' ? '🎬' : '🎵'}
                      </div>
                    )}

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#fff' : 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title ?? `${kindLabel(item.kind)} ${item.id.slice(0, 6)}`}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                        {kindLabel(item.kind)} · {extFor(item.kind, item.url).toUpperCase()}
                      </div>
                    </div>

                    {/* Checkbox */}
                    <div style={{
                      width: 18, height: 18, borderRadius: 5,
                      background: isSelected ? '#a855f7' : 'transparent',
                      border: `2px solid ${isSelected ? '#a855f7' : 'rgba(255,255,255,0.2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}>
                      {isSelected && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Progress bar */}
            <AnimatePresence>
              {isRunning && progress && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ padding: '8px 20px 0' }}
                >
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{status === 'zipping' ? 'ZIP-ს ვქმნი...' : `ჩამოტვირთვა ${progress.fetched}/${progress.total}...`}</span>
                    <span>{Math.round((progress.fetched / progress.total) * 100)}%</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <motion.div
                      animate={{ width: `${(progress.fetched / progress.total) * 100}%` }}
                      style={{ height: '100%', background: 'linear-gradient(90deg, #7c3aed, #a855f7)', borderRadius: 2 }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer */}
            <div style={{ padding: '14px 20px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              {status === 'done' ? (
                <div style={{
                  padding: '12px 20px',
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: 10,
                  color: '#10b981',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'center',
                }}>
                  ✅ ZIP ჩამოიტვირთა!
                </div>
              ) : status === 'error' ? (
                <div style={{
                  padding: '12px 20px',
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 10,
                  color: '#ef4444',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'center',
                }}>
                  ❌ ექსპორტი ვერ მოხერხდა. სცადეთ ხელახლა.
                </div>
              ) : (
                <motion.button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={selectedCount === 0 || isRunning}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    width: '100%',
                    padding: '13px 20px',
                    background: selectedCount > 0 && !isRunning
                      ? 'linear-gradient(135deg, #6d28d9, #a855f7)'
                      : 'rgba(255,255,255,0.05)',
                    border: 'none',
                    borderRadius: 12,
                    color: selectedCount > 0 && !isRunning ? '#fff' : 'rgba(255,255,255,0.3)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: selectedCount === 0 || isRunning ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}
                >
                  {isRunning ? (
                    <>
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        animation: 'spin 0.7s linear infinite',
                      }} />
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                      მუშავდება...
                    </>
                  ) : (
                    <>
                      <Download style={{ width: 16, height: 16 }} />
                      ZIP-ის ჩამოტვირთვა ({selectedCount} {selectedCount === 1 ? 'ფაილი' : 'ფაილი'})
                    </>
                  )}
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
