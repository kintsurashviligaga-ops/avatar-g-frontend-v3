"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from 'next/image';
import { Camera, RotateCw, Check, AlertCircle, Upload } from "lucide-react";
import { Button } from "./button";

interface FaceInputProps {
  onCapture: (imageData: string) => void;
  onSkip?: () => void;
  isLoading?: boolean;
}

type CameraMode = "idle" | "permission-request" | "ready" | "capturing" | "captured" | "error";

export function FaceInput({ onCapture, onSkip, isLoading = false }: FaceInputProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<CameraMode>("idle");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [hasMediaSupport, setHasMediaSupport] = useState(true);

  // Request camera permission
  const requestCamera = useCallback(async () => {
    setMode("permission-request");
    setErrorMessage(null);

    try {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setHasMediaSupport(false);
        setMode("error");
        setErrorMessage("Camera access requires HTTPS or localhost. Please use a secure connection.");
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasMediaSupport(false);
        setMode("error");
        setErrorMessage("Camera is not supported in this browser. Please upload a photo instead.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setMode("ready");
        };
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      const errorName =
        typeof err === "object" && err !== null && "name" in err
          ? String((err as { name?: string }).name)
          : error.name;
      setPermissionDenied(true);
      setMode("error");

      if (errorName === "NotAllowedError") {
        setErrorMessage("Camera permission was denied. Please enable camera access in your browser settings.");
      } else if (errorName === "NotFoundError") {
        setErrorMessage("No camera found on this device. Please use a device with a camera or upload a photo.");
      } else {
        setErrorMessage("Unable to access camera. Please try uploading a photo instead.");
      }
    }
  }, []);

  // Capture frame to canvas
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Flip horizontally (mirror effect like selfie)
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL("image/jpeg", 0.95);
    setCapturedImage(imageData);
    setMode("captured");

    // Stop the stream
    const stream = video.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  // Retake photo
  const retake = useCallback(() => {
    setCapturedImage(null);
    requestCamera();
  }, [requestCamera]);

  // Confirm capture
  const confirmCapture = useCallback(() => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  }, [capturedImage, onCapture]);

  // Handle file upload
  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result as string;
        setCapturedImage(data);
        setMode("captured");
      };
      reader.readAsDataURL(file);
    },
    []
  );

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      // Cleanup: stop video stream on unmount
      if (video?.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream?.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="p-6 rounded-2xl bg-[linear-gradient(155deg,rgba(12,22,46,0.92),rgba(7,14,32,0.85))] border border-white/[0.10] shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-xl">
      {/* Scan animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fi-scan-sweep {
          0%   { top: 4%;  opacity: 1; }
          48%  { top: 92%; opacity: 0.7; }
          52%  { top: 92%; opacity: 0.7; }
          100% { top: 4%;  opacity: 1; }
        }
        @keyframes fi-face-pulse {
          0%, 100% { opacity: 0.40; transform: scale(1); }
          50%       { opacity: 0.85; transform: scale(1.03); }
        }
        @keyframes fi-corner-blink {
          0%, 100% { opacity: 1; }
          45%       { opacity: 0.25; }
        }
        .fi-scan-line {
          position: absolute; left: 6%; right: 6%; height: 2px; border-radius: 9999px;
          background: linear-gradient(90deg, transparent, rgba(34,211,238,0.8), rgba(34,211,238,1), rgba(34,211,238,0.8), transparent);
          box-shadow: 0 0 10px 3px rgba(34,211,238,0.55), 0 0 22px 6px rgba(34,211,238,0.25);
          animation: fi-scan-sweep 2s ease-in-out infinite;
        }
        .fi-face-ring { animation: fi-face-pulse 1.8s ease-in-out infinite; }
        .fi-corner    { animation: fi-corner-blink 1.5s ease-in-out infinite; }
      ` }} />

      <div className="space-y-4">
        {/* Header */}
        <div>
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" />
            Capture Your Face
          </h3>
          <p className="text-sm text-cyan-100/40 mt-1">
            Take a clear photo of your face for avatar creation
          </p>
        </div>

        {/* Main content area */}
        <AnimatePresence mode="wait">
          {/* Idle state - Choose source */}
          {mode === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <Button
                onClick={requestCamera}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-sky-500 hover:opacity-90 text-white border-0 shadow-[0_0_20px_rgba(34,211,238,0.30)] transition-opacity"
                size="lg"
              >
                <Camera className="w-4 h-4 mr-2" />
                Open Camera
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/[0.08]" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-[rgba(12,22,46,0.92)] text-white/30">or</span>
                </div>
              </div>

              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                variant="outline"
                className="w-full border-white/[0.12] text-white/70 hover:bg-white/[0.06] hover:text-white"
                size="lg"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
              />

              {onSkip && (
                <Button
                  onClick={onSkip}
                  disabled={isLoading}
                  variant="ghost"
                  className="w-full text-white/30 hover:text-white/60"
                >
                  Skip for now
                </Button>
              )}
            </motion.div>
          )}

          {/* Permission request state */}
          {mode === "permission-request" && (
            <motion.div
              key="permission"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8"
            >
              <div className="inline-block">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <div className="w-14 h-14 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin mx-auto" />
                </motion.div>
              </div>
              <p className="text-cyan-100/50 mt-4">Requesting camera access…</p>
            </motion.div>
          )}

          {/* Camera ready state */}
          {mode === "ready" && (
            <motion.div
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Premium camera preview */}
              <div className="relative rounded-2xl overflow-hidden aspect-video bg-[#050b1c] border border-cyan-400/[0.22] shadow-[0_0_28px_rgba(34,211,238,0.12),0_0_0_1px_rgba(34,211,238,0.06)]">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover scale-x-[-1]"
                  playsInline
                  muted
                />
                {/* Scanner overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="fi-scan-line" />
                  <div
                    className="fi-face-ring absolute inset-[14%] rounded-[22%] border border-cyan-400/35"
                    style={{ boxShadow: '0 0 20px rgba(34,211,238,0.12) inset' }}
                  />
                  <div className="fi-corner absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-cyan-300 rounded-tl-xl" />
                  <div className="fi-corner absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-cyan-300 rounded-tr-xl" />
                  <div className="fi-corner absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-cyan-300 rounded-bl-xl" />
                  <div className="fi-corner absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-cyan-300 rounded-br-xl" />
                  <span className="absolute top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-black/70 border border-red-400/40 px-2.5 py-1 text-[10px] font-semibold text-red-200 backdrop-blur-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    LIVE
                  </span>
                </div>
              </div>
              <Button
                onClick={captureFrame}
                className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-sky-500 hover:opacity-90 text-white border-0 shadow-[0_0_20px_rgba(34,211,238,0.30)] transition-opacity"
                size="lg"
              >
                <Camera className="w-4 h-4 mr-2" />
                Capture Photo
              </Button>
            </motion.div>
          )}

          {/* Captured image state */}
          {mode === "captured" && capturedImage && (
            <motion.div
              key="captured"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="relative rounded-2xl overflow-hidden aspect-video border border-cyan-400/[0.18] shadow-[0_0_24px_rgba(34,211,238,0.10)]">
                <Image
                  src={capturedImage}
                  alt="Captured face"
                  fill
                  sizes="(max-width: 768px) 100vw, 640px"
                  className="object-cover"
                  unoptimized
                />
                {/* Captured overlay badge */}
                <span className="absolute top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-black/70 border border-cyan-400/40 px-2.5 py-1 text-[10px] font-semibold text-cyan-200 backdrop-blur-sm">
                  <Check className="w-3 h-3" />
                  Captured
                </span>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={retake}
                  variant="outline"
                  className="flex-1 border-white/[0.12] text-white/60 hover:bg-white/[0.06] hover:text-white"
                  size="lg"
                >
                  <RotateCw className="w-4 h-4 mr-2" />
                  Retake
                </Button>

                <Button
                  onClick={confirmCapture}
                  disabled={isLoading}
                  className="flex-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-sky-500 hover:opacity-90 text-white border-0 shadow-[0_0_20px_rgba(34,211,238,0.30)] transition-opacity"
                  size="lg"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Use This Photo
                </Button>
              </div>
            </motion.div>
          )}

          {/* Error state */}
          {mode === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <div className="rounded-xl bg-[rgba(239,68,68,0.08)] border border-red-400/[0.25] shadow-[0_0_20px_rgba(239,68,68,0.06)] p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 font-medium">Camera Access Failed</p>
                    <p className="text-red-200/70 text-sm mt-1">{errorMessage}</p>
                    {permissionDenied && (
                      <p className="text-red-200/60 text-xs mt-2">
                        Tip: On iOS Safari, open Settings → Safari → Camera and allow access.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Button
                onClick={requestCamera}
                className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-sky-500 hover:opacity-90 text-white border-0 shadow-[0_0_20px_rgba(34,211,238,0.30)] transition-opacity"
                size="lg"
                disabled={!hasMediaSupport}
              >
                <Camera className="w-4 h-4 mr-2" />
                Try Camera Again
              </Button>

              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full border-white/[0.12] text-white/70 hover:bg-white/[0.06] hover:text-white"
                size="lg"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Photo Instead
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
              />

              {onSkip && (
                <Button
                  onClick={onSkip}
                  variant="ghost"
                  className="w-full text-white/30 hover:text-white/60"
                >
                  Skip for now
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
