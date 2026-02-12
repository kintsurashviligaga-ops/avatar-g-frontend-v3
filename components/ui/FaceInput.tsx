"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from 'next/image';
import { Camera, RotateCw, Check, AlertCircle, Upload } from "lucide-react";
import { Button } from "./button";
import { Card } from "./card";

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
    <Card className="p-6 bg-gradient-to-br from-slate-900 to-slate-800 border-cyan-500/20">
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" />
            Capture Your Face
          </h3>
          <p className="text-sm text-gray-400 mt-1">
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
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
                size="lg"
              >
                <Camera className="w-4 h-4 mr-2" />
                Open Camera
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-800 text-gray-400">or</span>
                </div>
              </div>

              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                variant="outline"
                className="w-full"
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
                  className="w-full text-gray-400 hover:text-gray-300"
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
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Camera className="w-12 h-12 text-cyan-400" />
                </motion.div>
              </div>
              <p className="text-gray-300 mt-4">Requesting camera access...</p>
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
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover scale-x-[-1]"
                  playsInline
                  muted
                />
                <div className="absolute inset-0 border-2 border-cyan-400/30 rounded-lg pointer-events-none" />
              </div>
              <Button
                onClick={captureFrame}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
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
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <Image
                  src={capturedImage}
                  alt="Captured face"
                  fill
                  sizes="(max-width: 768px) 100vw, 640px"
                  className="object-cover"
                  unoptimized
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={retake}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  <RotateCw className="w-4 h-4 mr-2" />
                  Retake
                </Button>

                <Button
                  onClick={confirmCapture}
                  disabled={isLoading}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
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
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 font-medium">Camera Access Failed</p>
                    <p className="text-red-200/70 text-sm mt-1">{errorMessage}</p>
                    {permissionDenied && (
                      <p className="text-red-200/70 text-xs mt-2">
                        Tip: On iOS Safari, open Settings → Safari → Camera and allow access.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Button
                  onClick={requestCamera}
                  className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
                  size="lg"
                  disabled={!hasMediaSupport}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Try Camera Again
                </Button>
              </div>

              <Button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
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
                  className="w-full text-gray-400 hover:text-gray-300"
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
    </Card>
  );
}
