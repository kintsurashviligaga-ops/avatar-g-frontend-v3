"use client";

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Camera, Shield, Sparkles, Mic, Palette, Shirt, Eye, 
  ChevronRight, ChevronLeft, Upload, X, Check, RefreshCw, 
  Download, Share2, Play, Pause, Volume2, Wand2, Sparkle,
  Sliders, Type, Palette as PaletteIcon, Shirt as ShirtIcon,
  Glasses, Crown, Gem, Heart, Star, Zap, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { ServicePageShell } from '@/components/ServicePageShell';

// Types
type CreationStep = 'welcome' | 'face-input' | 'liveness' | 'processing' | 'voice-clone' | 'style-adjust' | 'fashion' | 'preview';

interface AvatarState {
  uploadedImage: string | null;
  isVerified: boolean;
  voiceSample: Blob | null;
  voicePlaying: boolean;
  style: {
    artStyle: 'realistic' | 'anime' | 'cartoon' | 'cyberpunk' | 'fantasy';
    age: number;
    skinTone: string;
    hairStyle: string;
    hairColor: string;
    eyeColor: string;
    expression: string;
  };
  fashion: {
    outfit: string;
    accessories: string[];
    background: string;
  };
  generatedAvatar: string | null;
  processingProgress: number;
}

const STEPS: { id: CreationStep; icon: any; title: string; subtitle: string }[] = [
  { id: 'welcome', icon: User, title: 'Welcome', subtitle: 'Start your journey' },
  { id: 'face-input', icon: Camera, title: 'Face Input', subtitle: 'Upload or capture' },
  { id: 'liveness', icon: Shield, title: 'Verify', subtitle: 'AI verification' },
  { id: 'processing', icon: Sparkles, title: 'Processing', subtitle: 'AI is working' },
  { id: 'voice-clone', icon: Mic, title: 'Voice Clone', subtitle: 'Record your voice' },
  { id: 'style-adjust', icon: Palette, title: 'Style', subtitle: 'Customize look' },
  { id: 'fashion', icon: Shirt, title: 'Fashion', subtitle: 'Dress up' },
  { id: 'preview', icon: Eye, title: 'Preview', subtitle: 'Your digital twin' },
];

// Style options
const ART_STYLES = [
  { id: 'realistic', name: 'Realistic', icon: User, color: 'from-blue-400 to-cyan-400' },
  { id: 'anime', name: 'Anime', icon: Sparkle, color: 'from-pink-400 to-rose-400' },
  { id: 'cartoon', name: 'Cartoon', icon: Zap, color: 'from-yellow-400 to-orange-400' },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: Zap, color: 'from-purple-400 to-pink-400' },
  { id: 'fantasy', name: 'Fantasy', icon: Crown, color: 'from-emerald-400 to-teal-400' },
];

const HAIR_STYLES = ['Short', 'Medium', 'Long', 'Curly', 'Bald', 'Ponytail', 'Bun'];
const HAIR_COLORS = ['Black', 'Brown', 'Blonde', 'Red', 'White', 'Blue', 'Pink', 'Purple'];
const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Hazel', 'Gray', 'Amber'];
const EXPRESSIONS = ['Neutral', 'Smile', 'Laugh', 'Serious', 'Surprised', 'Wink'];

const OUTFITS = [
  { id: 'casual', name: 'Casual', icon: ShirtIcon },
  { id: 'formal', name: 'Formal', icon: Crown },
  { id: 'sporty', name: 'Sporty', icon: Zap },
  { id: 'elegant', name: 'Elegant', icon: Gem },
  { id: 'street', name: 'Street', icon: Star },
  { id: 'fantasy', name: 'Fantasy', icon: Crown },
];

const ACCESSORIES = [
  { id: 'glasses', name: 'Glasses', icon: Glasses },
  { id: 'hat', name: 'Hat', icon: Crown },
  { id: 'earrings', name: 'Earrings', icon: Gem },
  { id: 'necklace', name: 'Necklace', icon: Heart },
  { id: 'watch', name: 'Watch', icon: Star },
];

const BACKGROUNDS = [
  { id: 'gradient', name: 'Gradient', color: 'from-cyan-500 to-blue-600' },
  { id: 'solid', name: 'Solid', color: 'bg-gray-800' },
  { id: 'studio', name: 'Studio', color: 'bg-gradient-to-br from-gray-700 to-gray-900' },
  { id: 'nature', name: 'Nature', color: 'from-green-500 to-emerald-600' },
  { id: 'urban', name: 'Urban', color: 'from-purple-500 to-pink-600' },
  { id: 'space', name: 'Space', color: 'from-indigo-900 via-purple-900 to-pink-900' },
];

export default function AvatarBuilderPage() {
  const [currentStep, setCurrentStep] = useState<CreationStep>('welcome');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [avatarState, setAvatarState] = useState<AvatarState>({
    uploadedImage: null,
    isVerified: false,
    voiceSample: null,
    voicePlaying: false,
    style: {
      artStyle: 'realistic',
      age: 25,
      skinTone: 'medium',
      hairStyle: 'Medium',
      hairColor: 'Brown',
      eyeColor: 'Brown',
      expression: 'Smile',
    },
    fashion: {
      outfit: 'casual',
      accessories: [],
      background: 'gradient',
    },
    generatedAvatar: null,
    processingProgress: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);
  const CurrentStepIcon = STEPS[currentStepIndex].icon;

  const nextStep = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1].id);
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].id);
    }
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarState(prev => ({ ...prev, uploadedImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAvatarState(prev => ({ ...prev, voiceSample: blob }));
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    setRecordingTime(0);
  };

  // Simulate processing
  const startProcessing = () => {
    setCurrentStep('processing');
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setAvatarState(prev => ({ ...prev, processingProgress: progress }));
      if (progress >= 100) {
        clearInterval(interval);
        setAvatarState(prev => ({ 
          ...prev, 
          generatedAvatar: prev.uploadedImage // In real app, this would be the AI-generated image
        }));
        setTimeout(() => setCurrentStep('voice-clone'), 500);
      }
    }, 300);
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'welcome':
        return <WelcomeStep onStart={nextStep} />;
      case 'face-input':
        return (
          <FaceInputStep
            uploadedImage={avatarState.uploadedImage}
            onFileSelect={() => fileInputRef.current?.click()}
            onContinue={() => { startProcessing(); }}
            onBack={prevStep}
          />
        );
      case 'liveness':
        return (
          <LivenessStep
            onVerify={() => {
              setAvatarState(prev => ({ ...prev, isVerified: true }));
              nextStep();
            }}
          />
        );
      case 'processing':
        return <ProcessingStep progress={avatarState.processingProgress} />;
      case 'voice-clone':
        return (
          <VoiceCloneStep
            isRecording={isRecording}
            recordingTime={recordingTime}
            hasRecording={!!avatarState.voiceSample}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onContinue={nextStep}
            onBack={prevStep}
            onSkip={nextStep}
          />
        );
      case 'style-adjust':
        return (
          <StyleAdjustStep
            style={avatarState.style}
            onStyleChange={(key, value) => 
              setAvatarState(prev => ({ 
                ...prev, 
                style: { ...prev.style, [key]: value } 
              }))
            }
            onContinue={nextStep}
            onBack={prevStep}
          />
        );
      case 'fashion':
        return (
          <FashionStep
            fashion={avatarState.fashion}
            onFashionChange={(key, value) =>
              setAvatarState(prev => ({
                ...prev,
                fashion: { ...prev.fashion, [key]: value }
              }))
            }
            onToggleAccessory={(acc) =>
              setAvatarState(prev => ({
                ...prev,
                fashion: {
                  ...prev.fashion,
                  accessories: prev.fashion.accessories.includes(acc)
                    ? prev.fashion.accessories.filter(a => a !== acc)
                    : [...prev.fashion.accessories, acc]
                }
              }))
            }
            onContinue={nextStep}
            onBack={prevStep}
          />
        );
      case 'preview':
        return (
          <PreviewStep
            avatar={avatarState.generatedAvatar}
            onRegenerate={() => setCurrentStep('face-input')}
            onDownload={() => {}}
            onShare={() => {}}
            onBack={prevStep}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ServicePageShell
      title="Avatar Builder"
      description="Create your digital twin with AI"
      icon={<User size={24} />}
      gradient="from-cyan-400 to-blue-500"
    >
      <div className="min-h-screen bg-[#0A0F1C] text-white">
        {/* Progress Bar */}
        {currentStep !== 'welcome' && (
          <div className="py-6 px-4 bg-black/20 border-b border-white/5">
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-4">
                {STEPS.map((step, idx) => {
                  const isActive = idx === currentStepIndex;
                  const isCompleted = idx < currentStepIndex;
                  const Icon = step.icon;

                  return (
                    <div key={step.id} className="flex flex-col items-center">
                      <motion.div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
                          isActive 
                            ? 'bg-gradient-to-br from-cyan-400 to-blue-500' 
                            : isCompleted 
                              ? 'bg-green-500' 
                              : 'bg-gray-800'
                        }`}
                        animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 2 }}
                      >
                        <Icon size={20} className="text-white" />
                      </motion.div>
                      <span className={`text-xs ${isActive ? 'text-cyan-400' : 'text-gray-500'}`}>
                        {step.title}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentStepIndex) / (STEPS.length - 1)) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="pt-8 pb-24 px-4">
          <div className="max-w-4xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {renderStepContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
    </ServicePageShell>
  );
}

// Step Components
function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center py-12">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="w-32 h-32 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center"
      >
        <User size={64} className="text-white" />
      </motion.div>

      <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
        Create Your Digital Twin
      </h1>

      <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
        Transform yourself into a stunning AI avatar with just a few clicks. 
        Our advanced AI will create a perfect digital representation of you.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12 max-w-3xl mx-auto">
        {[
          { icon: Camera, title: 'Upload Photo', desc: 'Take a selfie or upload' },
          { icon: Sparkles, title: 'AI Processing', desc: 'Advanced neural networks' },
          { icon: Share2, title: 'Share & Use', desc: 'Download in any format' },
        ].map((item, idx) => (
          <Card key={idx} className="bg-gray-900/50 border-gray-800 p-6">
            <item.icon className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
            <h3 className="font-semibold mb-1">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.desc}</p>
          </Card>
        ))}
      </div>

      <Button
        onClick={onStart}
        size="lg"
        className="bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white px-12 py-6 text-lg rounded-2xl"
      >
        Get Started
        <ArrowRight className="ml-2" size={24} />
      </Button>
    </div>
  );
}

function FaceInputStep({ 
  uploadedImage, 
  onFileSelect, 
  onContinue, 
  onBack 
}: { 
  uploadedImage: string | null;
  onFileSelect: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold mb-2">Upload Your Photo</h2>
      <p className="text-gray-400 mb-8">Choose a clear photo of your face for best results</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Upload Area */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onFileSelect}
          className={`aspect-square rounded-3xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center transition-colors ${
            uploadedImage 
              ? 'border-green-500 bg-green-500/10' 
              : 'border-gray-600 hover:border-cyan-400 bg-gray-900/50'
          }`}
        >
          {uploadedImage ? (
            <>
              <img src={uploadedImage} alt="Uploaded" className="w-full h-full object-cover rounded-3xl" />
              <div className="absolute inset-0 bg-black/50 rounded-3xl flex items-center justify-center">
                <Check className="w-16 h-16 text-green-400" />
              </div>
            </>
          ) : (
            <>
              <Upload className="w-16 h-16 text-gray-400 mb-4" />
              <p className="text-lg font-medium">Click to upload</p>
              <p className="text-sm text-gray-500 mt-2">JPG, PNG up to 10MB</p>
            </>
          )}
        </motion.div>

        {/* Camera Option */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="aspect-square rounded-3xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex flex-col items-center justify-center cursor-pointer"
        >
          <Camera className="w-16 h-16 text-cyan-400 mb-4" />
          <p className="text-lg font-medium">Use Camera</p>
          <p className="text-sm text-gray-500 mt-2">Take a selfie now</p>
        </motion.div>
      </div>

      <div className="flex gap-4 justify-center">
        <Button variant="outline" onClick={onBack} size="lg">
          <ChevronLeft className="mr-2" />
          Back
        </Button>
        <Button 
          onClick={onContinue} 
          disabled={!uploadedImage}
          size="lg"
          className="bg-gradient-to-r from-cyan-400 to-blue-500"
        >
          Continue
          <ChevronRight className="ml-2" />
        </Button>
      </div>
    </div>
  );
}

function LivenessStep({ onVerify }: { onVerify: () => void }) {
  const [countdown, setCountdown] = useState(3);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onVerify();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onVerify]);

  return (
    <div className="text-center py-12">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="w-24 h-24 mx-auto mb-8 rounded-full border-4 border-cyan-400 border-t-transparent"
      />
      <h2 className="text-3xl font-bold mb-4">Verifying...</h2>
      <p className="text-gray-400">AI is analyzing your photo for authenticity</p>
      <p className="text-2xl font-bold text-cyan-400 mt-4">{countdown}</p>
    </div>
  );
}

function ProcessingStep({ progress }: { progress: number }) {
  return (
    <div className="text-center py-12">
      <motion.div
        animate={{ 
          scale: [1, 1.2, 1],
          rotate: [0, 180, 360]
        }}
        transition={{ duration: 3, repeat: Infinity }}
        className="w-32 h-32 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center"
      >
        <Sparkles className="w-16 h-16 text-cyan-400" />
      </motion.div>

      <h2 className="text-3xl font-bold mb-4">AI is Creating Your Avatar</h2>
      <p className="text-gray-400 mb-8">This may take a few moments...</p>

      <div className="max-w-md mx-auto">
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-4">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p className="text-cyan-400 font-semibold">{progress}% Complete</p>
      </div>

      <div className="mt-8 flex justify-center gap-2">
        {['Analyzing features', 'Generating model', 'Applying styles', 'Finalizing'].map((step, idx) => (
          <div 
            key={step} 
            className={`px-3 py-1 rounded-full text-sm ${
              progress > (idx + 1) * 25 ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-500'
            }`}
          >
            {progress > (idx + 1) * 25 && <Check className="inline w-3 h-3 mr-1" />}
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceCloneStep({
  isRecording,
  recordingTime,
  hasRecording,
  onStartRecording,
  onStopRecording,
  onContinue,
  onBack,
  onSkip,
}: {
  isRecording: boolean;
  recordingTime: number;
  hasRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onContinue: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold mb-2">Clone Your Voice</h2>
      <p className="text-gray-400 mb-8">Record a 10-second sample for voice cloning</p>

      <div className="max-w-md mx-auto mb-8">
        <motion.div
          animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1 }}
          className={`w-48 h-48 mx-auto rounded-full flex items-center justify-center mb-6 cursor-pointer transition-colors ${
            isRecording 
              ? 'bg-red-500/20 border-4 border-red-500' 
              : hasRecording
                ? 'bg-green-500/20 border-4 border-green-500'
                : 'bg-cyan-500/20 border-4 border-cyan-500'
          }`}
          onClick={isRecording ? onStopRecording : onStartRecording}
        >
          {isRecording ? (
            <div className="text-center">
              <div className="w-12 h-12 bg-red-500 rounded-lg" />
              <p className="mt-2 text-red-400 font-bold">{formatTime(recordingTime)}</p>
            </div>
          ) : hasRecording ? (
            <Check className="w-20 h-20 text-green-400" />
          ) : (
            <Mic className="w-20 h-20 text-cyan-400" />
          )}
        </motion.div>

        <p className="text-gray-400">
          {isRecording 
            ? 'Recording... Click to stop' 
            : hasRecording 
              ? 'Recording saved!'
              : 'Tap to start recording'}
        </p>

        {hasRecording && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <Button variant="outline" size="sm">
              <Play className="w-4 h-4 mr-2" />
              Play
            </Button>
            <Button variant="outline" size="sm" onClick={onStartRecording}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-record
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-4 justify-center">
        <Button variant="outline" onClick={onBack} size="lg">
          <ChevronLeft className="mr-2" />
          Back
        </Button>
        <Button variant="ghost" onClick={onSkip} size="lg">
          Skip for now
        </Button>
        <Button 
          onClick={onContinue}
          size="lg"
          className="bg-gradient-to-r from-cyan-400 to-blue-500"
        >
          Continue
          <ChevronRight className="ml-2" />
        </Button>
      </div>
    </div>
  );
}

function StyleAdjustStep({
  style,
  onStyleChange,
  onContinue,
  onBack,
}: {
  style: AvatarState['style'];
  onStyleChange: (key: string, value: any) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-3xl font-bold mb-2 text-center">Customize Style</h2>
      <p className="text-gray-400 mb-8 text-center">Choose your avatar's artistic style</p>

      {/* Art Style Selection */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Art Style</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ART_STYLES.map((artStyle) => (
            <motion.button
              key={artStyle.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onStyleChange('artStyle', artStyle.id)}
              className={`p-4 rounded-2xl border-2 transition-all ${
                style.artStyle === artStyle.id
                  ? 'border-cyan-400 bg-cyan-400/20'
                  : 'border-gray-700 bg-gray-900/50'
              }`}
            >
              <div className={`w-12 h-12 mx-auto mb-2 rounded-xl bg-gradient-to-br ${artStyle.color} flex items-center justify-center`}>
                <artStyle.icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-sm font-medium">{artStyle.name}</p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Age Slider */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Age: {style.age}</h3>
        <Slider
          value={[style.age]}
          onValueChange={([v]) => onStyleChange('age', v)}
          min={18}
          max={80}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between text-sm text-gray-500 mt-2">
          <span>18</span>
          <span>80</span>
        </div>
      </div>

      {/* Hair Style */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Hair Style</h3>
        <div className="flex flex-wrap gap-2">
          {HAIR_STYLES.map((hair) => (
            <Button
              key={hair}
              variant={style.hairStyle === hair ? 'default' : 'outline'}
              size="sm"
              onClick={() => onStyleChange('hairStyle', hair)}
              className={style.hairStyle === hair ? 'bg-cyan-400' : ''}
            >
              {hair}
            </Button>
          ))}
        </div>
      </div>

      {/* Hair Color */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Hair Color</h3>
        <div className="flex flex-wrap gap-2">
          {HAIR_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onStyleChange('hairColor', color)}
              className={`px-4 py-2 rounded-full border-2 transition-all ${
                style.hairColor === color
                  ? 'border-cyan-400 bg-cyan-400/20'
                  : 'border-gray-700 bg-gray-900'
              }`}
            >
              {color}
            </button>
          ))}
        </div>
      </div>

      {/* Eye Color */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Eye Color</h3>
        <div className="flex flex-wrap gap-2">
          {EYE_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onStyleChange('eyeColor', color)}
              className={`px-4 py-2 rounded-full border-2 transition-all ${
                style.eyeColor === color
                  ? 'border-cyan-400 bg-cyan-400/20'
                  : 'border-gray-700 bg-gray-900'
              }`}
            >
              {color}
            </button>
          ))}
        </div>
      </div>

      {/* Expression */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Expression</h3>
        <div className="flex flex-wrap gap-2">
          {EXPRESSIONS.map((expr) => (
            <Button
              key={expr}
              variant={style.expression === expr ? 'default' : 'outline'}
              size="sm"
              onClick={() => onStyleChange('expression', expr)}
              className={style.expression === expr ? 'bg-cyan-400' : ''}
            >
              {expr}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <Button variant="outline" onClick={onBack} size="lg">
          <ChevronLeft className="mr-2" />
          Back
        </Button>
        <Button 
          onClick={onContinue}
          size="lg"
          className="bg-gradient-to-r from-cyan-400 to-blue-500"
        >
          Continue
          <ChevronRight className="ml-2" />
        </Button>
      </div>
    </div>
  );
}

function FashionStep({
  fashion,
  onFashionChange,
  onToggleAccessory,
  onContinue,
  onBack,
}: {
  fashion: AvatarState['fashion'];
  onFashionChange: (key: string, value: any) => void;
  onToggleAccessory: (acc: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-3xl font-bold mb-2 text-center">Fashion & Style</h2>
      <p className="text-gray-400 mb-8 text-center">Dress up your avatar</p>

      {/* Outfit Selection */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Outfit</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {OUTFITS.map((outfit) => (
            <motion.button
              key={outfit.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onFashionChange('outfit', outfit.id)}
              className={`p-4 rounded-2xl border-2 transition-all ${
                fashion.outfit === outfit.id
                  ? 'border-cyan-400 bg-cyan-400/20'
                  : 'border-gray-700 bg-gray-900/50'
              }`}
            >
              <outfit.icon className={`w-8 h-8 mx-auto mb-2 ${
                fashion.outfit === outfit.id ? 'text-cyan-400' : 'text-gray-400'
              }`} />
              <p className="text-sm font-medium">{outfit.name}</p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Accessories */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Accessories</h3>
        <div className="flex flex-wrap gap-3">
          {ACCESSORIES.map((acc) => (
            <motion.button
              key={acc.id}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onToggleAccessory(acc.id)}
              className={`p-3 rounded-xl border-2 transition-all ${
                fashion.accessories.includes(acc.id)
                  ? 'border-cyan-400 bg-cyan-400/20'
                  : 'border-gray-700 bg-gray-900/50'
              }`}
            >
              <acc.icon className={`w-6 h-6 ${
                fashion.accessories.includes(acc.id) ? 'text-cyan-400' : 'text-gray-400'
              }`} />
              <p className="text-xs mt-1">{acc.name}</p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Background */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Background</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {BACKGROUNDS.map((bg) => (
            <motion.button
              key={bg.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onFashionChange('background', bg.id)}
              className={`h-20 rounded-xl bg-gradient-to-br ${bg.color} border-2 transition-all ${
                fashion.background === bg.id
                  ? 'border-white'
                  : 'border-transparent'
              }`}
            >
              <p className="text-sm font-medium text-white drop-shadow-lg">{bg.name}</p>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <Button variant="outline" onClick={onBack} size="lg">
          <ChevronLeft className="mr-2" />
          Back
        </Button>
        <Button 
          onClick={onContinue}
          size="lg"
          className="bg-gradient-to-r from-cyan-400 to-blue-500"
        >
          Continue
          <ChevronRight className="ml-2" />
        </Button>
      </div>
    </div>
  );
}

function PreviewStep({
  avatar,
  onRegenerate,
  onDownload,
  onShare,
  onBack,
}: {
  avatar: string | null;
  onRegenerate: () => void;
  onDownload: () => void;
  onShare: () => void;
  onBack: () => void;
}) {
  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold mb-2">Your Digital Twin is Ready!</h2>
      <p className="text-gray-400 mb-8">Here's your AI-generated avatar</p>

      {/* Avatar Display */}
      <div className="max-w-md mx-auto mb-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-2 border-cyan-400/30"
        >
          {avatar ? (
            <img 
              src={avatar} 
              alt="Generated Avatar" 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-32 h-32 text-gray-600" />
            </div>
          )}
        </motion.div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-center mb-8">
        <Button onClick={onDownload} size="lg" className="bg-green-500 hover:bg-green-600">
          <Download className="mr-2" />
          Download
        </Button>
        <Button onClick={onShare} size="lg" variant="outline">
          <Share2 className="mr-2" />
          Share
        </Button>
        <Button onClick={onRegenerate} size="lg" variant="outline">
          <RefreshCw className="mr-2" />
          Create New
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-8">
        <Card className="bg-gray-900/50 border-gray-800 p-4">
          <p className="text-2xl font-bold text-cyan-400">4K</p>
          <p className="text-sm text-gray-500">Resolution</p>
        </Card>
        <Card className="bg-gray-900/50 border-gray-800 p-4">
          <p className="text-2xl font-bold text-cyan-400">PNG</p>
          <p className="text-sm text-gray-500">Format</p>
        </Card>
        <Card className="bg-gray-900/50 border-gray-800 p-4">
          <p className="text-2xl font-bold text-cyan-400">AI</p>
          <p className="text-sm text-gray-500">Generated</p>
        </Card>
      </div>

      <Button variant="outline" onClick={onBack} size="lg">
        <ChevronLeft className="mr-2" />
        Back to Edit
      </Button>
    </div>
  );
}