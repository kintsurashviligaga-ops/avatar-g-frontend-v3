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
        className="fixed inset-0 z-[100] bg-black flex flex-col"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Top bar — minimal: close + recording timer */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-10 w-10 rounded-full flex items-center justify-center bg-white/10 text-white active:scale-90 transition"
          >
            <X className="w-5 h-5" />
          </button>
          {state === 'recording' ? (
            <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#ef4444' }} />
              <span className="text-[13px] font-mono font-semibold text-white">{formatTime(recordingTime)}</span>
            </div>
          ) : (
            <span className="w-10" />
          )}
        </div>

        {/* Full-screen viewport with rounded bounds */}
        <div className="relative flex-1 min-h-0 mx-3 rounded-[1.75rem] overflow-hidden bg-black">
          {(state === 'ready' || state === 'recording') && (
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay muted playsInline />
          )}
          {state === 'preview' && previewUrl && (
            mode === 'video' ? (
              <video src={previewUrl} className="absolute inset-0 h-full w-full object-cover" controls autoPlay loop playsInline />
            ) : (
              <Image src={previewUrl} alt="Captured" width={1200} height={1600} unoptimized className="absolute inset-0 h-full w-full object-cover" />
            )
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-rose-400">{error}</p>
            </div>
          )}
          {state === 'idle' && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-9 h-9 rounded-full border-2 border-white/15 border-t-white animate-spin" />
            </div>
          )}
        </div>

        {/* Bottom: mode wheel + shutter */}
        <div className="flex-shrink-0 pt-4">
          {(state === 'ready' || state === 'idle') && (
            <div className="flex items-center justify-center gap-7 pb-5 text-[12px] font-semibold uppercase tracking-[0.18em]">
              {(['photo', 'video'] as CameraMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); if (state === 'ready') startCamera(); }}
                  className="transition-colors"
                  style={{ color: mode === m ? '#fde047' : 'rgba(255,255,255,0.45)' }}
                >
                  {m === 'photo' ? c.photo : c.video}
                </button>
              ))}
            </div>
          )}

          <div className="relative flex items-center justify-center h-24">
            {state === 'ready' && (
              <button
                onClick={switchCamera}
                aria-label={c.switchCam}
                className="absolute right-8 h-12 w-12 rounded-full flex items-center justify-center bg-white/10 text-white active:scale-90 transition"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            )}

            {state === 'ready' && mode === 'photo' && (
              <button
                onClick={capturePhoto}
                aria-label={c.capture}
                className="h-[74px] w-[74px] rounded-full bg-white active:scale-90 transition ring-4 ring-white/35 ring-offset-2 ring-offset-black"
              />
            )}
            {state === 'ready' && mode === 'video' && (
              <button
                onClick={startRecording}
                aria-label={c.record}
                className="h-[74px] w-[74px] rounded-full bg-white flex items-center justify-center active:scale-90 transition ring-4 ring-white/35 ring-offset-2 ring-offset-black"
              >
                <span className="h-6 w-6 rounded-full bg-red-500" />
              </button>
            )}
            {state === 'recording' && (
              <button
                onClick={stopRecording}
                aria-label={c.stop}
                className="h-[74px] w-[74px] rounded-full bg-white flex items-center justify-center active:scale-90 transition ring-4 ring-white/35 ring-offset-2 ring-offset-black"
              >
                <span className="h-6 w-6 rounded-md bg-red-500" />
              </button>
            )}
            {state === 'preview' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={retake}
                  className="flex items-center gap-2 px-5 py-3 rounded-full text-[13px] font-semibold bg-white/10 text-white active:scale-95 transition"
                >
                  <RotateCcw className="w-4 h-4" /> {c.retake}
                </button>
                <button
                  onClick={attachMedia}
                  className="flex items-center gap-2 px-6 py-3 rounded-full text-[13px] font-semibold bg-white text-black active:scale-95 transition"
                >
                  <Check className="w-4 h-4" /> {c.attach}
                </button>
              </div>
            )}
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </motion.div>
    </AnimatePresence>
  );
}
