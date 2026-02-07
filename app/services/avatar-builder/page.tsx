"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Camera, Shield, Sparkles, Mic, Palette, Shirt, Eye, 
  ChevronRight, ChevronLeft, Upload, Check, RefreshCw, 
  Download, Share2, Play, Pause, Zap, Crown, Gem, Heart, 
  Star, ArrowRight, Glasses, Sliders, Loader2, CheckCircle2,
  AlertCircle, Image as ImageIcon, Type
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { ServicePageShell } from '@/components/ServicePageShell';

// ტიპები
type Step = 'welcome' | 'face' | 'processing' | 'voice' | 'style' | 'fashion' | 'preview';

interface AvatarData {
  image: string | null;
  voice: Blob | null;
  voiceURL: string | null;
  style: {
    artStyle: string;
    age: number;
    hairStyle: string;
    hairColor: string;
    eyeColor: string;
    expression: string;
  };
  fashion: {
    outfit: string;
    accessories: string[];
  };
  generatedImage: string | null;
}

// კონფიგურაცია
const STEPS = [
  { id: 'welcome', icon: User, title: 'Welcome' },
  { id: 'face', icon: Camera, title: 'Face' },
  { id: 'processing', icon: Sparkles, title: 'Processing' },
  { id: 'voice', icon: Mic, title: 'Voice' },
  { id: 'style', icon: Palette, title: 'Style' },
  { id: 'fashion', icon: Shirt, title: 'Fashion' },
  { id: 'preview', icon: Eye, title: 'Preview' },
] as const;

const ART_STYLES = [
  { id: 'realistic', name: 'Realistic', icon: User },
  { id: 'anime', name: 'Anime', icon: Sparkles },
  { id: 'cartoon', name: 'Cartoon', icon: Zap },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: Zap },
  { id: 'fantasy', name: 'Fantasy', icon: Crown },
];

const HAIR_STYLES = ['Short', 'Medium', 'Long', 'Curly', 'Bald'];
const HAIR_COLORS = ['Black', 'Brown', 'Blonde', 'Red', 'White', 'Blue'];
const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Gray', 'Amber'];
const EXPRESSIONS = ['Neutral', 'Smile', 'Laugh', 'Serious'];
const OUTFITS = [
  { id: 'casual', name: 'Casual', icon: Shirt },
  { id: 'formal', name: 'Formal', icon: Crown },
  { id: 'sporty', name: 'Sporty', icon: Zap },
  { id: 'elegant', name: 'Elegant', icon: Gem },
];
const ACCESSORIES = [
  { id: 'glasses', name: 'Glasses', icon: Glasses },
  { id: 'hat', name: 'Hat', icon: Crown },
  { id: 'earrings', name: 'Earrings', icon: Gem },
  { id: 'necklace', name: 'Necklace', icon: Heart },
];

export default function AvatarBuilderPage() {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [avatar, setAvatar] = useState<AvatarData>({
    image: null,
    voice: null,
    voiceURL: null,
    style: {
      artStyle: 'realistic',
      age: 25,
      hairStyle: 'Medium',
      hairColor: 'Brown',
      eyeColor: 'Brown',
      expression: 'Smile',
    },
    fashion: {
      outfit: 'casual',
      accessories: [],
    },
    generatedImage: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  // ნავიგაცია
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

  // ფოტოს ატვირთვა
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(prev => ({ ...prev, image: reader.result as string }));
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // ხმის ჩაწერა
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAvatar(prev => ({ ...prev, voice: blob, voiceURL: url }));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 10) {
            stopRecording();
            return 10;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setError('Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
  };

  const playRecording = () => {
    if (avatar.voiceURL) {
      if (!audioRef.current) {
        audioRef.current = new Audio(avatar.voiceURL);
        audioRef.current.onended = () => setIsPlaying(false);
      }
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  // ავატარის გენერაცია
  const generateAvatar = async () => {
    setCurrentStep('processing');
    setProcessingProgress(0);

    // სიმულაცია - რეალურად აქ AI API იქნებოდა
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setProcessingProgress(i);
    }

    // რეალურად აქ AI დააბრუნებს ახალ სურათს
    // ახლა ვიყენებთ ატვირთულს + ეფექტებს
    setAvatar(prev => ({ 
      ...prev, 
      generatedImage: prev.image // რეალურად აქ AI-ის პასუხი იქნებოდა
    }));

    setTimeout(() => {
      setCurrentStep('voice');
    }, 500);
  };

  // ჩამოტვირთვა
  const downloadAvatar = () => {
    if (avatar.generatedImage || avatar.image) {
      const link = document.createElement('a');
      link.href = avatar.generatedImage || avatar.image!;
      link.download = `avatar-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // გაზიარება
  const shareAvatar = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My AI Avatar',
          text: 'Check out my digital twin!',
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert('Link copied!');
    }
  };

  // კომპონენტის გასუფთავება
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (avatar.voiceURL) URL.revokeObjectURL(avatar.voiceURL);
    };
  }, [avatar.voiceURL]);

  // რენდერი
  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="text-center py-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-32 h-32 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center"
            >
              <User size={64} className="text-white" />
            </motion.div>
            <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Avatar Builder
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
              Create your digital twin with AI. Upload a photo, customize your style, and generate a unique avatar.
            </p>
            <Button onClick={nextStep} size="lg" className="bg-gradient-to-r from-cyan-400 to-blue-500 px-12 py-6 text-lg">
              Get Started <ArrowRight className="ml-2" />
            </Button>
          </div>
        );

      case 'face':
        return (
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-2">Upload Your Photo</h2>
            <p className="text-gray-400 mb-8">Choose a clear photo of your face</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 max-w-3xl mx-auto">
              <motion.div
                whileHover={{ scale: 1.02 }}
                onClick={() => fileInputRef.current?.click()}
                className={`aspect-square rounded-3xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center ${
                  avatar.image ? 'border-green-500 bg-green-500/10' : 'border-gray-600 hover:border-cyan-400'
                }`}
              >
                {avatar.image ? (
                  <>
                    <img src={avatar.image} alt="Uploaded" className="w-full h-full object-cover rounded-3xl" />
                    <div className="absolute inset-0 bg-black/50 rounded-3xl flex items-center justify-center">
                      <Check className="w-16 h-16 text-green-400" />
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-16 h-16 text-cyan-400 mb-4" />
                    <p className="text-lg font-medium">Click to upload</p>
                    <p className="text-sm text-gray-500">JPG, PNG up to 10MB</p>
                  </>
                )}
              </motion.div>

              <div className="aspect-square rounded-3xl bg-gray-900/50 border border-gray-800 p-6 flex flex-col justify-center">
                <h3 className="text-lg font-semibold mb-4">Tips for best results:</h3>
                <ul className="space-y-2 text-gray-400 text-left">
                  <li>✓ Face clearly visible</li>
                  <li>✓ Good lighting</li>
                  <li>✓ Front facing</li>
                  <li>✓ Neutral background</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <Button variant="outline" onClick={prevStep} size="lg">
                <ChevronLeft className="mr-2" /> Back
              </Button>
              <Button 
                onClick={generateAvatar} 
                disabled={!avatar.image}
                size="lg"
                className="bg-gradient-to-r from-cyan-400 to-blue-500"
              >
                Generate Avatar <ChevronRight className="ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'processing':
        return (
          <div className="text-center py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-32 h-32 mx-auto mb-8 rounded-full border-4 border-cyan-400 border-t-transparent"
            />
            <h2 className="text-3xl font-bold mb-4">AI is Creating Your Avatar</h2>
            <p className="text-gray-400 mb-8">Analyzing features and generating...</p>
            <div className="max-w-md mx-auto">
              <Progress value={processingProgress} className="h-2 mb-2" />
              <p className="text-cyan-400 font-semibold">{processingProgress}%</p>
            </div>
          </div>
        );

      case 'voice':
        return (
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-2">Clone Your Voice</h2>
            <p className="text-gray-400 mb-8">Record a 10-second sample</p>

            <div className="max-w-md mx-auto mb-8">
              <motion.div
                animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1 }}
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-48 h-48 mx-auto rounded-full flex items-center justify-center mb-6 cursor-pointer ${
                  isRecording ? 'bg-red-500/20 border-4 border-red-500' : 
                  avatar.voice ? 'bg-green-500/20 border-4 border-green-500' : 
                  'bg-cyan-500/10 border-4 border-cyan-400'
                }`}
              >
                {isRecording ? (
                  <div className="text-center">
                    <div className="w-12 h-12 bg-red-500 rounded-lg mb-2" />
                    <p className="text-red-400 font-bold text-xl">0:{recordingTime.toString().padStart(2, '0')}</p>
                  </div>
                ) : avatar.voice ? (
                  <CheckCircle2 className="w-20 h-20 text-green-400" />
                ) : (
                  <Mic className="w-20 h-20 text-cyan-400" />
                )}
              </motion.div>

              {avatar.voice && (
                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={playRecording}>
                    {isPlaying ? <Pause className="mr-2" /> : <Play className="mr-2" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                  <Button variant="outline" onClick={startRecording}>
                    <RefreshCw className="mr-2" /> Re-record
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-4 justify-center">
              <Button variant="outline" onClick={prevStep} size="lg">
                <ChevronLeft className="mr-2" /> Back
              </Button>
              <Button variant="ghost" onClick={nextStep} size="lg">
                Skip
              </Button>
              <Button onClick={nextStep} size="lg" className="bg-gradient-to-r from-cyan-400 to-blue-500">
                Continue <ChevronRight className="ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'style':
        return (
          <div>
            <h2 className="text-3xl font-bold mb-2 text-center">Customize Style</h2>
            <p className="text-gray-400 mb-8 text-center">Choose your avatar's look</p>

            <div className="space-y-6 max-w-3xl mx-auto">
              {/* Art Style */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Art Style</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {ART_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setAvatar(prev => ({ ...prev, style: { ...prev.style, artStyle: style.id } }))}
                      className={`p-4 rounded-xl border-2 ${
                        avatar.style.artStyle === style.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-gray-700'
                      }`}
                    >
                      <style.icon className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">{style.name}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Age */}
              <div className="bg-gray-900/50 rounded-xl p-4">
                <div className="flex justify-between mb-2">
                  <span>Age</span>
                  <span className="text-cyan-400 font-bold">{avatar.style.age}</span>
                </div>
                <Slider
                  value={[avatar.style.age]}
                  onValueChange={([v]) => setAvatar(prev => ({ ...prev, style: { ...prev.style, age: v } }))}
                  min={18}
                  max={80}
                />
              </div>

              {/* Hair & Eyes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900/50 rounded-xl p-4">
                  <h4 className="font-medium mb-2">Hair Style</h4>
                  <div className="flex flex-wrap gap-2">
                    {HAIR_STYLES.map(h => (
                      <button
                        key={h}
                        onClick={() => setAvatar(prev => ({ ...prev, style: { ...prev.style, hairStyle: h } }))}
                        className={`px-3 py-1 rounded-lg text-sm ${
                          avatar.style.hairStyle === h ? 'bg-cyan-400 text-black' : 'bg-gray-800'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-xl p-4">
                  <h4 className="font-medium mb-2">Eye Color</h4>
                  <div className="flex flex-wrap gap-2">
                    {EYE_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setAvatar(prev => ({ ...prev, style: { ...prev.style, eyeColor: c } }))}
                        className={`px-3 py-1 rounded-lg text-sm ${
                          avatar.style.eyeColor === c ? 'bg-cyan-400 text-black' : 'bg-gray-800'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-center mt-8">
              <Button variant="outline" onClick={prevStep} size="lg">
                <ChevronLeft className="mr-2" /> Back
              </Button>
              <Button onClick={nextStep} size="lg" className="bg-gradient-to-r from-cyan-400 to-blue-500">
                Continue <ChevronRight className="ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'fashion':
        return (
          <div>
            <h2 className="text-3xl font-bold mb-2 text-center">Fashion</h2>
            <p className="text-gray-400 mb-8 text-center">Dress up your avatar</p>

            <div className="space-y-6 max-w-3xl mx-auto">
              {/* Outfit */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Outfit</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {OUTFITS.map((outfit) => (
                    <button
                      key={outfit.id}
                      onClick={() => setAvatar(prev => ({ ...prev, fashion: { ...prev.fashion, outfit: outfit.id } }))}
                      className={`p-4 rounded-xl border-2 ${
                        avatar.fashion.outfit === outfit.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-gray-700'
                      }`}
                    >
                      <outfit.icon className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">{outfit.name}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Accessories */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Accessories</h3>
                <div className="flex flex-wrap gap-3">
                  {ACCESSORIES.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => {
                        const newAcc = avatar.fashion.accessories.includes(acc.id)
                          ? avatar.fashion.accessories.filter(a => a !== acc.id)
                          : [...avatar.fashion.accessories, acc.id];
                        setAvatar(prev => ({ ...prev, fashion: { ...prev.fashion, accessories: newAcc } }));
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 ${
                        avatar.fashion.accessories.includes(acc.id) 
                          ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400' 
                          : 'border-gray-700'
                      }`}
                    >
                      <acc.icon className="w-5 h-5" />
                      <span>{acc.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-center mt-8">
              <Button variant="outline" onClick={prevStep} size="lg">
                <ChevronLeft className="mr-2" /> Back
              </Button>
              <Button onClick={nextStep} size="lg" className="bg-gradient-to-r from-cyan-400 to-blue-500">
                Preview <ChevronRight className="ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'preview':
        return (
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-2">Your Avatar is Ready!</h2>
            <p className="text-gray-400 mb-8">Download or share your digital twin</p>

            <div className="max-w-md mx-auto mb-8">
              <div className="aspect-square rounded-3xl overflow-hidden border-4 border-cyan-400/30 shadow-2xl">
                {avatar.generatedImage || avatar.image ? (
                  <img 
                    src={avatar.generatedImage || avatar.image!} 
                    alt="Avatar" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    <User className="w-32 h-32 text-gray-600" />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto mb-8">
              <Card className="bg-gray-900/50 border-gray-800 p-4">
                <p className="text-xl font-bold text-cyan-400">{avatar.style.artStyle}</p>
                <p className="text-xs text-gray-500">Style</p>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800 p-4">
                <p className="text-xl font-bold text-cyan-400">{avatar.style.age}</p>
                <p className="text-xs text-gray-500">Age</p>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800 p-4">
                <p className="text-xl font-bold text-cyan-400">{avatar.fashion.outfit}</p>
                <p className="text-xs text-gray-500">Outfit</p>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800 p-4">
                <p className="text-xl font-bold text-cyan-400">4K</p>
                <p className="text-xs text-gray-500">Quality</p>
              </Card>
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              <Button onClick={downloadAvatar} size="lg" className="bg-green-500 hover:bg-green-600">
                <Download className="mr-2" /> Download
              </Button>
              <Button onClick={shareAvatar} size="lg" variant="outline">
                <Share2 className="mr-2" /> Share
              </Button>
              <Button onClick={() => setCurrentStep('face')} size="lg" variant="outline">
                <RefreshCw className="mr-2" /> Create New
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <ServicePageShell
      title="Avatar Builder"
      description="Create your digital twin"
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
                          isActive ? 'bg-gradient-to-br from-cyan-400 to-blue-500' : 
                          isCompleted ? 'bg-green-500' : 'bg-gray-800'
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

        {/* Error */}
        {error && (
          <div className="max-w-4xl mx-auto mt-4 px-4">
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl">
              {error}
            </div>
          </div>
        )}

        {/* Content */}
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
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

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