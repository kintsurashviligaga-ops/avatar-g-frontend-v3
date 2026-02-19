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
        {/* Video Stream Container */}
        <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-white/10">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            style={{
              display: cameraState.isActive ? 'block' : 'none',
              backgroundColor: '#000',
            }}
          />

          {/* Loading State */}
          {cameraState.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-purple-500 border-t-transparent mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Initializing camera...</p>
              </div>
            </div>
          )}

          {/* Placeholder when inactive */}
          {!cameraState.isActive && !cameraState.isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
              <Camera className="w-12 h-12 text-gray-500 mb-3" />
              <p className="text-gray-400 text-sm">{stepLabel}</p>
            </div>
          )}
        </div>

        {/* Error Message */}
        {cameraState.error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-300">{cameraState.error}</p>
                <p className="text-xs text-red-400 mt-1">
                  If this persists, please check your camera permissions in browser settings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Diagnostics (Dev Mode) */}
        {showDiagnostics && diagnostics && (
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg font-mono text-xs text-blue-300">
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
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Camera size={16} className="mr-2" />
              Start Camera
            </Button>
          ) : (
            <>
              <Button
                onClick={capturePhoto}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
              >
                📷 Capture
              </Button>
              <Button
                onClick={stopCamera}
                variant="outline"
                className="flex-1 border-white/10"
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
              className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
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
