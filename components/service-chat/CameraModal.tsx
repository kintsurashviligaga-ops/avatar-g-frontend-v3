'use client';

/**
 * components/service-chat/CameraModal.tsx
 * ==========================================
 * Full-featured camera modal for all service chats.
 * Supports: photo capture, video recording, front/back switch,
 * fullscreen mode, face alignment overlay, preview before attach.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Camera, Video, X, RotateCcw, Maximize, Minimize, Check, RefreshCw } from 'lucide-react';
import type { ServiceChatAttachment } from './types';

type CameraMode = 'photo' | 'video';
type CameraState = 'idle' | 'ready' | 'recording' | 'preview';

interface CameraModalProps {
  isOpen: boolean;
  accentColor: string;
  onClose: () => void;
  onAttach: (attachment: ServiceChatAttachment) => void;
  showFaceGuide?: boolean;
  /** Render as an immersive absolute-black full-viewport layer (chat usage). */
  fullScreen?: boolean;
}

const COPY = {
  en: { photo: 'Photo', video: 'Video', capture: 'Capture', record: 'Record', stop: 'Stop', retake: 'Retake', attach: 'Attach', switchCam: 'Switch', fullscreen: 'Fullscreen', noCamera: 'Camera unavailable', denied: 'Camera access denied', align: 'Align your face' },
  ka: { photo: 'ფოტო', video: 'ვიდეო', capture: 'გადაღება', record: 'ჩაწერა', stop: 'შეჩერება', retake: 'თავიდან', attach: 'მიმაგრება', switchCam: 'შეცვლა', fullscreen: 'სრულეკრანი', noCamera: 'კამერა მიუწვდომელია', denied: 'კამერაზე წვდომა უარყოფილია', align: 'გაასწორე სახე' },
  ru: { photo: 'Фото', video: 'Видео', capture: 'Снять', record: 'Запись', stop: 'Стоп', retake: 'Заново', attach: 'Прикрепить', switchCam: 'Камера', fullscreen: 'Полный экран', noCamera: 'Камера недоступна', denied: 'Доступ к камере запрещён', align: 'Выровняйте лицо' },
};

export function CameraModal({ isOpen, accentColor, onClose, onAttach, showFaceGuide = false, fullScreen = false }: CameraModalProps) {
  const [mode, setMode] = useState<CameraMode>('photo');
  const [state, setState] = useState<CameraState>('idle');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number>(0);

  const lang = typeof window !== 'undefined'
    ? ((document.documentElement.lang || 'en') as 'en' | 'ka' | 'ru')
    : 'en';
  const c = COPY[lang] || COPY.en;
  // Immersive = either the browser fullscreen API is engaged OR the caller asked
  // for the absolute-black full-viewport chat layer.
  const immersive = isFullscreen || fullScreen;

  /* ── Start camera ── */
  const startCamera = useCallback(async (facingMode?: 'user' | 'environment') => {
    setError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const fm = facingMode || facing;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: fm, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: mode === 'video',
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setState('ready');
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? c.denied : c.noCamera;
      setError(msg);
    }
  }, [facing, mode, c]);

  /* ── Open → start camera ── */
  useEffect(() => {
    if (isOpen) {
      setState('idle');
      setPreviewUrl(null);
      setPreviewBlob(null);
      setError(null);
      setRecordingTime(0);
      startCamera();
    } else {
      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      clearInterval(timerRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /* ── Fullscreen listener ── */
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  /* ── Clean up on unmount ── */
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      clearInterval(timerRef.current);
      if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Switch camera ── */
  const switchCamera = useCallback(() => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    startCamera(next);
  }, [facing, startCamera]);

  /* ── Toggle fullscreen ── */
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  /* ── Capture photo ── */
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewBlob(blob);
      setState('preview');
      // Keep stream alive for retake
    }, 'image/jpeg', 0.92);
  }, []);

  /* ── Start video recording ── */
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    setRecordingTime(0);
    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp9,opus' });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewBlob(blob);
        setState('preview');
      };
      recorder.start(100);
      recorderRef.current = recorder;
      setState('recording');
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch {
      // Fallback mimeType
      try {
        const recorder = new MediaRecorder(streamRef.current);
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          setPreviewBlob(blob);
          setState('preview');
        };
        recorder.start(100);
        recorderRef.current = recorder;
        setState('recording');
        timerRef.current = window.setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      } catch {
        setError('Recording not supported');
      }
    }
  }, []);

  /* ── Stop video recording ── */
  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  /* ── Retake ── */
  const retake = useCallback(() => {
    if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setRecordingTime(0);
    setState('ready');
    // Re-attach stream
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    } else {
      startCamera();
    }
  }, [previewUrl, startCamera]);

  /* ── Attach and close ── */
  const attachMedia = useCallback(() => {
    if (!previewBlob || !previewUrl) return;
    const isVideo = mode === 'video';
    const att: ServiceChatAttachment = {
      id: `cam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: isVideo ? `recording_${Date.now()}.webm` : `photo_${Date.now()}.jpg`,
      type: isVideo ? 'video' : 'image',
      mimeType: isVideo ? 'video/webm' : 'image/jpeg',
      size: previewBlob.size,
      preview: isVideo ? undefined : previewUrl,
      dataUrl: previewUrl,
    };
    onAttach(att);
    onClose();
  }, [previewBlob, previewUrl, mode, onAttach, onClose]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        // When immersive (full-screen API or `fullScreen` prop), use the
        // absolute-black layer the chat shell expects. Otherwise apply mobile
        // padding + safe-area insets so iOS Safari can't clip the controls.
        className={immersive
          ? 'fixed inset-0 z-[100] flex items-center justify-center'
          : 'fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4'}
        style={immersive
          ? { background: '#000', backdropFilter: 'none' }
          : {
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(8px)',
              paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)',
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
            }}
      >
        <motion.div
          ref={containerRef}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          // Immersive: full-viewport black layer for chat shell.
          // Otherwise: classic 2xl card that fills mobile safe-area without
          // clipping controls.
          className={`relative w-full overflow-hidden flex flex-col ${immersive ? '' : 'max-w-2xl rounded-2xl sm:rounded-3xl'}`}
          style={immersive
            ? {
                background: '#000',
                border: 'none',
                boxShadow: 'none',
                maxWidth: '100%',
                borderRadius: 0,
                height: '100vh',
                width: '100vw',
              }
            : {
                background: '#0a0e14',
                border: `1px solid ${accentColor}25`,
                boxShadow: `0 8px 60px rgba(0,0,0,0.6), 0 0 60px ${accentColor}10`,
                maxHeight: '100%',
              }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-3">
              {/* Mode toggle */}
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                {(['photo', 'video'] as CameraMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); if (state === 'ready') startCamera(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all"
                    style={{
                      background: mode === m ? `${accentColor}20` : 'transparent',
                      color: mode === m ? accentColor : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {m === 'photo' ? <Camera className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                    {m === 'photo' ? c.photo : c.video}
                  </button>
                ))}
              </div>
              {state === 'recording' && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
                  <span className="text-xs font-mono font-bold" style={{ color: '#ef4444' }}>{formatTime(recordingTime)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleFullscreen} className="p-1.5 rounded-lg transition-all" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg transition-all" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Viewport ── */}
          {/* flex-1 + min-h-0 lets the frame absorb leftover modal height.
              Non-immersive mode also caps maxHeight against dvh so portrait
              mobile viewports never overflow the control bar. */}
          <div
            className="relative flex-1 min-h-0 bg-black"
            style={{
              aspectRatio: immersive ? undefined : '4/3',
              maxHeight: immersive ? undefined : 'min(72vh, calc(100dvh - 200px))',
            }}
          >
            {/* Live feed */}
            {(state === 'ready' || state === 'recording') && (
              <>
                <video ref={videoRef} className="w-full h-full object-contain sm:object-cover" autoPlay muted playsInline />
                {/* Face guide */}
                {showFaceGuide && state === 'ready' && mode === 'photo' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-44 h-56 sm:w-52 sm:h-68 rounded-[50%] border-2" style={{ borderColor: `${accentColor}60`, boxShadow: `0 0 20px ${accentColor}15`, animation: 'pulse 2s ease-in-out infinite' }} />
                    <span className="absolute bottom-20 text-[11px] font-medium px-3 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.6)', color: accentColor }}>{c.align}</span>
                  </div>
                )}
                {/* Corner crosshairs — hidden in the immersive (Apple-style)
                    layer to keep the viewport clean; shown only in the compact
                    card view where they read as a deliberate framing accent. */}
                {!immersive && [{ top: 12, left: 12 }, { top: 12, right: 12 }, { bottom: 12, left: 12 }, { bottom: 12, right: 12 }].map((pos, i) => (
                  <div key={i} className="absolute w-4 h-4 pointer-events-none" style={pos as React.CSSProperties}>
                    <div className="absolute top-0 left-0 w-4 h-px" style={{ backgroundColor: `${accentColor}50` }} />
                    <div className="absolute top-0 left-0 w-px h-4" style={{ backgroundColor: `${accentColor}50` }} />
                  </div>
                ))}
              </>
            )}

            {/* Preview */}
            {state === 'preview' && previewUrl && (
              mode === 'video' ? (
                <video src={previewUrl} className="w-full h-full object-contain sm:object-cover" controls autoPlay loop playsInline />
              ) : (
                <Image src={previewUrl} alt="Captured" width={1200} height={900} unoptimized className="w-full h-full object-contain sm:object-cover" />
              )
            )}

            {/* Error */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm font-medium" style={{ color: '#f87171' }}>{error}</p>
              </div>
            )}

            {/* Idle loading */}
            {state === 'idle' && !error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(255,255,255,0.1)', borderTopColor: accentColor }} />
              </div>
            )}
          </div>

          {/* ── Controls ── */}
          <div
            className="flex items-center justify-center gap-4 px-4 flex-shrink-0"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: '1rem',
              paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {state === 'ready' && mode === 'photo' && (
              <>
                <button onClick={switchCamera} className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <RefreshCw className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
                </button>
                <button onClick={capturePhoto} className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)`, boxShadow: `0 0 30px ${accentColor}40`, border: '3px solid rgba(255,255,255,0.3)' }}>
                  <div className="w-11 h-11 rounded-full" style={{ border: '2px solid rgba(255,255,255,0.8)' }} />
                </button>
                <button onClick={toggleFullscreen} className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Maximize className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
                </button>
              </>
            )}
            {state === 'ready' && mode === 'video' && (
              <>
                <button onClick={switchCamera} className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <RefreshCw className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
                </button>
                <button onClick={startRecording} className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 0 30px rgba(239,68,68,0.4)', border: '3px solid rgba(255,255,255,0.3)' }}>
                  <div className="w-5 h-5 rounded-full bg-white" />
                </button>
                <button onClick={toggleFullscreen} className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Maximize className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
                </button>
              </>
            )}
            {state === 'recording' && (
              <button onClick={stopRecording} className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 0 30px rgba(239,68,68,0.4)', border: '3px solid rgba(255,255,255,0.3)' }}>
                <div className="w-5 h-5 rounded-sm bg-white" />
              </button>
            )}
            {state === 'preview' && (
              <>
                <button onClick={retake} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                  <RotateCcw className="w-3.5 h-3.5" /> {c.retake}
                </button>
                <button onClick={attachMedia} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95" style={{ background: `linear-gradient(135deg, ${accentColor}30, ${accentColor}15)`, border: `1px solid ${accentColor}40`, color: accentColor, boxShadow: `0 0 20px ${accentColor}15` }}>
                  <Check className="w-3.5 h-3.5" /> {c.attach}
                </button>
              </>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
