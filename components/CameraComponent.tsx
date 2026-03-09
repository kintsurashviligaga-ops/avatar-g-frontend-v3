'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CameraComponentProps {
  onCapture: (imageData: string) => void;
  onError?: (error: string) => void;
  className?: string;
  showDiagnostics?: boolean; // Dev mode only - shows camera info
  stepLabel?: string;
  retryLabel?: string;
}

interface CameraState {
  isActive: boolean;
  hasPermission: boolean;
  error: string | null;
  isLoading: boolean;
}

interface DiagnosticsInfo {
  permissionState: string;
  devicesCount: number;
  videoState: string;
  videoSettings: {
    width: number | string;
    height: number | string;
    enabled: boolean;
  };
  timestamp: string;
}

/**
 * Production-Grade Camera Component
 * 
 * Features:
 * - Handles autoplay policies (muted, playsInline)
 * - Proper error handling with user-friendly messages
 * - HTTPS requirement check
 * - Automatic fallback constraints
 * - Track cleanup on unmount
 * - Dev diagnostics for debugging
 * - Retry mechanism
 * - Proper TypeScript typing
 */
export const CameraComponent = React.forwardRef<
  HTMLVideoElement,
  CameraComponentProps
>(
  (
    {
      onCapture,
      onError,
      className = '',
      showDiagnostics = false,
      stepLabel = 'Camera Preview',
      retryLabel = 'Retry Camera',
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [cameraState, setCameraState] = useState<CameraState>({
      isActive: false,
      hasPermission: false,
      error: null,
      isLoading: false,
    });

    const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);

    // Update ref to videoRef for parent components
    useEffect(() => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(videoRef.current);
        } else {
          ref.current = videoRef.current;
        }
      }
    }, [ref]);

    /**
     * Check if we're in a secure context (HTTPS)
     */
    const isSecureContext = useCallback(() => {
      if (typeof window === 'undefined') return false;
      return window.location.protocol.startsWith('https') || 
             window.location.hostname.includes('localhost') ||
             window.location.hostname === '127.0.0.1';
    }, []);

    /**
     * Update diagnostics (dev mode only)
     */
    const updateDiagnostics = useCallback(async () => {
      if (!showDiagnostics || !videoRef.current) return;

      try {
        const permissionStatus = navigator.permissions
          ? await navigator.permissions.query({ name: 'camera' as PermissionName })
          : null;

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        setDiagnostics({
          permissionState: permissionStatus?.state || 'unknown',
          devicesCount: videoDevices.length,
          videoState: streamRef.current ? 'active' : 'inactive',
          videoSettings: {
            width: videoRef.current.videoWidth || 'pending',
            height: videoRef.current.videoHeight || 'pending',
            enabled: streamRef.current?.getTracks()[0]?.enabled || false,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('[Camera Diagnostics] Query failed:', err);
      }
    }, [showDiagnostics]);

    /**
     * Start camera stream with fallback constraints
     */
    const startCamera = useCallback(async () => {
      // Prevent re-entry
      if (cameraState.isActive || cameraState.isLoading) return;

      setCameraState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        // Guard: Client-side only
        if (typeof window === 'undefined') {
          throw new Error('Camera access requires browser environment');
        }

        // Guard: HTTPS required (except localhost)
        if (!isSecureContext()) {
          throw new Error(
            'Camera requires HTTPS connection (or localhost for development)'
          );
        }

        // Guard: getUserMedia support
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Your browser does not support camera access'
          );
        }

        // Try with ideal constraints first (best quality)
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        let stream: MediaStream | null = null;

        // Primary attempt: Full constraints
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (_primaryError) {
          console.warn('[Camera] Primary constraints failed, trying fallback...');

          // Fallback 1: Minimal constraints (Safari compatibility)
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user' },
              audio: false,
            });
          } catch (_fallback1Error) {
            console.warn('[Camera] Fallback 1 failed, trying basic constraints...');

            // Fallback 2: Basic video constraint
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        if (!stream) {
          throw new Error('Failed to access camera stream');
        }

        streamRef.current = stream;
        const videoEl = videoRef.current;

        if (!videoEl) {
          stream.getTracks().forEach(track => track.stop());
          throw new Error('Video element not available');
        }

        // CRITICAL: Set video element attributes for autoplay policies
        videoEl.muted = true;              // Allows autoplay without sound
        videoEl.playsInline = true;        // Prevents fullscreen on iOS/Safari
        videoEl.autoplay = true;           // Explicit autoplay
        videoEl.style.display = 'block';   // Ensure visible
        videoEl.style.backgroundColor = '#000'; // Black background while loading

        // Attach stream to video element
        videoEl.srcObject = stream;

        // Wait for video to be ready (metadata loaded)
        await new Promise<void>((resolve, reject) => {
          const onLoadedMetadata = () => {
            videoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
            videoEl.removeEventListener('error', onError);
            resolve();
          };

          const onError = (_err: Event) => {
            videoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
            videoEl.removeEventListener('error', onError);
            reject(new Error('Video element error'));
          };

          videoEl.addEventListener('loadedmetadata', onLoadedMetadata);
          videoEl.addEventListener('error', onError);

          // Timeout failsafe (5 seconds)
          const timeout = setTimeout(() => {
            videoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
            videoEl.removeEventListener('error', onError);
            reject(new Error('Video load timeout'));
          }, 5000);

          // Clear timeout if resolved early
          return () => clearTimeout(timeout);
        });

        // Attempt to play video
        try {
          await videoEl.play();
        } catch (playError) {
          const errorMsg = playError instanceof Error ? playError.message : 'Play failed';
          throw new Error(`Could not start playback: ${errorMsg}`);
        }

        setCameraState(prev => ({
          ...prev,
          isActive: true,
          hasPermission: true,
          isLoading: false,
        }));

        // Log diagnostics
        if (showDiagnostics) {
          console.log('[Camera] Started successfully', {
            videoWidth: videoEl.videoWidth,
            videoHeight: videoEl.videoHeight,
            constraints: constraints.video,
            trackCount: stream.getTracks().length,
            audioEnabled: stream.getAudioTracks().length > 0,
          });
          await updateDiagnostics();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Camera access failed';

        // Parse error name for better UX
        let userMessage = errorMessage;

        if (error instanceof DOMException) {
          switch (error.name) {
            case 'NotAllowedError':
              userMessage = 'Camera permission was denied. Please enable it in your browser settings.';
              break;
            case 'NotFoundError':
              userMessage = 'No camera device found on this device.';
              break;
            case 'NotSupportedError':
              userMessage = 'Your browser does not support camera access.';
              break;
            case 'PermissionDeniedError':
              userMessage = 'Camera permission denied by system.';
              break;
            case 'PermissionDismissedError':
              userMessage = 'Camera permission request was dismissed.';
              break;
            case 'SecurityError':
              userMessage = 'Camera access is blocked by security policy. Try HTTPS or localhost.';
              break;
            default:
              userMessage = `Camera error: ${error.name}`;
          }
        }

        console.error('[Camera] Error:', {
          message: errorMessage,
          name: error instanceof DOMException ? error.name : 'Unknown',
          userMessage,
        });

        setCameraState(prev => ({
          ...prev,
          error: userMessage,
          isLoading: false,
        }));

        onError?.(userMessage);
      }
    }, [cameraState.isActive, cameraState.isLoading, onError, showDiagnostics, updateDiagnostics, isSecureContext]);

    /**
     * Capture photo from video stream
     */
    const capturePhoto = useCallback(() => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) return;

      // Set canvas size to match video dimensions
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to JPEG data URL
      const imageData = canvas.toDataURL('image/jpeg', 0.95);

      onCapture(imageData);
    }, [onCapture]);

    /**
     * Stop camera stream
     */
    const stopCamera = useCallback(() => {
      if (streamRef.current) {
        // Stop all tracks (video + audio)
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          if (showDiagnostics) {
            console.log('[Camera] Track stopped:', { kind: track.kind, enabled: track.enabled });
          }
        });
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.style.display = 'none';
      }

      setCameraState(prev => ({
        ...prev,
        isActive: false,
      }));
    }, [showDiagnostics]);

    /**
     * Cleanup on unmount
     */
    useEffect(() => {
      return () => {
        stopCamera();
      };
    }, [stopCamera]);

    return (
      <div className={`camera-container ${className}`}>
        {/* Premium camera scan animation keyframes */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes cam-scan-sweep {
            0%   { top: 4%;  opacity: 1; }
            48%  { top: 92%; opacity: 0.7; }
            52%  { top: 92%; opacity: 0.7; }
            100% { top: 4%;  opacity: 1; }
          }
          @keyframes cam-face-pulse {
            0%, 100% { opacity: 0.40; transform: scale(1); }
            50%       { opacity: 0.85; transform: scale(1.03); }
          }
          @keyframes cam-corner-blink {
            0%, 100% { opacity: 1; }
            45%       { opacity: 0.25; }
          }
          .cam-scan-line {
            position: absolute; left: 6%; right: 6%; height: 2px; border-radius: 9999px;
            background: linear-gradient(90deg, transparent, rgba(34,211,238,0.8), rgba(34,211,238,1), rgba(34,211,238,0.8), transparent);
            box-shadow: 0 0 10px 3px rgba(34,211,238,0.55), 0 0 22px 6px rgba(34,211,238,0.25);
            animation: cam-scan-sweep 2s ease-in-out infinite;
          }
          .cam-face-ring { animation: cam-face-pulse 1.8s ease-in-out infinite; }
          .cam-corner    { animation: cam-corner-blink 1.5s ease-in-out infinite; }
        ` }} />

        {/* Video Stream Container */}
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-[#050b1c] border border-cyan-400/[0.20] shadow-[0_0_32px_rgba(34,211,238,0.10),0_0_0_1px_rgba(34,211,238,0.06)]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            style={{
              display: cameraState.isActive ? 'block' : 'none',
              backgroundColor: '#000',
            }}
          />

          {/* Scanner overlay — visible when camera is streaming */}
          {cameraState.isActive && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="cam-scan-line" />
              <div
                className="cam-face-ring absolute inset-[14%] rounded-[22%] border border-cyan-400/35"
                style={{ boxShadow: '0 0 20px rgba(34,211,238,0.12) inset' }}
              />
              <div className="cam-corner absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-cyan-300 rounded-tl-xl" />
              <div className="cam-corner absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-cyan-300 rounded-tr-xl" />
              <div className="cam-corner absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-cyan-300 rounded-bl-xl" />
              <div className="cam-corner absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-cyan-300 rounded-br-xl" />
              {/* REC indicator */}
              <span className="absolute top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-black/70 border border-red-400/40 px-2.5 py-1 text-[10px] font-semibold text-red-200 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                REC
              </span>
            </div>
          )}

          {/* Loading State */}
          {cameraState.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#050b1c]/90 backdrop-blur-sm">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin mx-auto mb-3" />
                <p className="text-cyan-200/60 text-sm">Initializing camera…</p>
              </div>
            </div>
          )}

          {/* Placeholder when inactive */}
          {!cameraState.isActive && !cameraState.isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="p-4 rounded-2xl bg-cyan-500/[0.06] border border-cyan-400/[0.12] mb-4">
                <Camera className="w-10 h-10 text-cyan-400/50" />
              </div>
              <p className="text-cyan-100/40 text-sm font-medium">{stepLabel}</p>
            </div>
          )}
        </div>

        {/* Error Message */}
        {cameraState.error && (
          <div className="mt-3 p-3 rounded-xl bg-[rgba(239,68,68,0.08)] border border-red-400/[0.25] shadow-[0_0_20px_rgba(239,68,68,0.06)]">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-300/90">{cameraState.error}</p>
                <p className="text-xs text-red-400/60 mt-1">
                  Check camera permissions in your browser settings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Diagnostics (Dev Mode) */}
        {showDiagnostics && diagnostics && (
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl font-mono text-xs text-blue-300">
            <p className="font-bold mb-2">📊 Camera Diagnostics</p>
            <p>Permission: {diagnostics.permissionState}</p>
            <p>Devices: {diagnostics.devicesCount}</p>
            <p>State: {diagnostics.videoState}</p>
            <p>Resolution: {diagnostics.videoSettings.width}x{diagnostics.videoSettings.height}</p>
            <p>Track: {diagnostics.videoSettings.enabled ? 'enabled' : 'disabled'}</p>
            <p className="text-xs text-blue-400 mt-2">{diagnostics.timestamp}</p>
          </div>
        )}

        {/* Controls */}
        <div className="mt-4 flex gap-3">
          {!cameraState.isActive ? (
            <Button
              onClick={startCamera}
              disabled={cameraState.isLoading}
              className="flex-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 hover:opacity-90 text-white border-0 shadow-[0_0_20px_rgba(34,211,238,0.30)] transition-opacity"
            >
              <Camera size={16} className="mr-2" />
              Start Camera
            </Button>
          ) : (
            <>
              <Button
                onClick={capturePhoto}
                className="flex-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 hover:opacity-90 text-white border-0 shadow-[0_0_20px_rgba(34,211,238,0.30)] transition-opacity"
              >
                <Camera size={16} className="mr-2" />
                Capture
              </Button>
              <Button
                onClick={stopCamera}
                variant="outline"
                className="flex-1 border-white/[0.12] text-white/60 hover:bg-white/[0.06] hover:text-white"
              >
                Stop
              </Button>
            </>
          )}

          {cameraState.error && (
            <Button
              onClick={startCamera}
              disabled={cameraState.isLoading}
              variant="outline"
              className="flex-1 border-red-400/30 text-red-400 hover:bg-red-500/10 hover:border-red-400/50"
            >
              <RotateCcw size={16} className="mr-2" />
              {retryLabel}
            </Button>
          )}
        </div>

        {/* Hidden Canvas for Photo Capture */}
        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
          width={1280}
          height={720}
        />
      </div>
    );
  }
);

CameraComponent.displayName = 'CameraComponent';

export default CameraComponent;
