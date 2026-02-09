"use client";

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Camera, Sparkles, Upload, Download, Share2, Wand2, 
  Loader2, Check, X, ArrowRight, ArrowLeft, Image as ImageIcon,
  Palette, Shirt, Eye, Smile, Sun, Moon, Zap, Crown, Heart, Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ChatInterface } from '@/components/services/ChatInterface';

interface AvatarStyle {
  id: string;
  name: string;
  emoji: string;
  description: string;
  prompt: string;
}

interface AvatarPreset {
  id: string;
  name: string;
  data: {
    selectedStyle: string;
    age: number;
    presentation: string;
    bodyType: string;
    skinTone: string;
    hairStyle: string;
    hairColor: string;
    eyeColor: string;
    expression: string;
    top: string;
    bottom: string;
    shoes: string;
    eyewear: string;
    headwear: string;
    accessories: string[];
    colorway: string;
    lighting: string;
    pose: string;
    extraDetails: string;
  };
}

const AVATAR_STYLES: AvatarStyle[] = [
  { id: 'professional', name: 'Professional', emoji: '💼', description: 'Business headshot', prompt: 'professional business portrait, formal attire, confident expression, studio lighting' },
  { id: 'casual', name: 'Casual', emoji: '😊', description: 'Relaxed & friendly', prompt: 'casual portrait, relaxed expression, natural lighting, approachable' },
  { id: 'artistic', name: 'Artistic', emoji: '🎨', description: 'Creative & unique', prompt: 'artistic portrait, creative styling, artistic lighting, expressive' },
  { id: 'cinematic', name: 'Cinematic', emoji: '🎬', description: 'Movie-quality', prompt: 'cinematic portrait, dramatic lighting, film quality, professional' },
  { id: 'anime', name: 'Anime', emoji: '✨', description: 'Anime style', prompt: 'anime style portrait, vibrant colors, stylized features, high detail' },
  { id: 'cartoon', name: 'Cartoon', emoji: '🎭', description: '3D cartoon', prompt: '3D cartoon style, colorful, stylized, fun and playful' },
  { id: 'cyberpunk', name: 'Cyberpunk', emoji: '🤖', description: 'Futuristic tech', prompt: 'cyberpunk style, neon lights, futuristic, tech aesthetic' },
  { id: 'fantasy', name: 'Fantasy', emoji: '🧙', description: 'Magical theme', prompt: 'fantasy style portrait, magical, ethereal, mystical atmosphere' },
];

const SUGGESTIONS = [
  "Professional headshot with navy blue suit",
  "Casual portrait with warm smile and natural lighting",
  "Artistic black and white portrait",
  "Cinematic portrait with dramatic shadows",
  "Friendly avatar with bright background",
  "Creative portrait with colorful styling"
];

const BODY_TYPES = ['Slim', 'Athletic', 'Average', 'Curvy', 'Muscular'];
const PRESENTATIONS = ['Feminine', 'Masculine', 'Androgynous'];
const POSES = [
  { id: 'a-pose', name: 'A-pose', prompt: 'neutral A-pose' },
  { id: 't-pose', name: 'T-pose', prompt: 'neutral T-pose' },
  { id: 'relaxed', name: 'Relaxed', prompt: 'relaxed standing pose' },
  { id: 'confident', name: 'Confident', prompt: 'confident pose, shoulders back' },
  { id: 'hands-on-hips', name: 'Hands on Hips', prompt: 'hands on hips pose' },
];
const SKIN_TONES = ['Light', 'Medium', 'Tan', 'Deep'];
const HAIR_STYLES = ['Short', 'Medium', 'Long', 'Curly', 'Buzz'];
const HAIR_COLORS = ['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Blue'];
const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Gray', 'Amber', 'Hazel'];
const EXPRESSIONS = ['Neutral', 'Smile', 'Serious', 'Confident', 'Friendly'];
const ACCESSORIES = ['Earrings', 'Necklace', 'Watch', 'Bracelet', 'Ring'];
const LIGHTING_STYLES = ['Studio', 'Cinematic', 'Soft Daylight', 'Neon'];

const COLORWAYS = [
  { id: 'premium-tech', name: 'Premium Tech', colors: ['#2B2D31', '#F2F2F2', '#21D4FD'] },
  { id: 'urban-classic', name: 'Urban Classic', colors: ['#1E1E1E', '#6C7280', '#F59E0B'] },
  { id: 'modern-soft', name: 'Modern Soft', colors: ['#0F172A', '#E5E7EB', '#10B981'] },
];

const TOP_ITEMS = [
  { id: 'jacket', name: 'Jacket', desc: 'Clean tech jacket', gradient: 'from-slate-800 to-slate-600' },
  { id: 'hoodie', name: 'Hoodie', desc: 'Street hoodie', gradient: 'from-zinc-800 to-zinc-600' },
  { id: 'tshirt', name: 'T-shirt', desc: 'Minimal tee', gradient: 'from-gray-700 to-gray-500' },
  { id: 'suit', name: 'Formal Suit', desc: 'Premium suit', gradient: 'from-neutral-900 to-neutral-700' },
  { id: 'streetwear', name: 'Streetwear', desc: 'Urban fit', gradient: 'from-indigo-900 to-indigo-700' },
];

const BOTTOM_ITEMS = [
  { id: 'jeans', name: 'Jeans', desc: 'Slim denim', gradient: 'from-blue-900 to-blue-700' },
  { id: 'pants', name: 'Pants', desc: 'Tailored pants', gradient: 'from-stone-800 to-stone-600' },
  { id: 'cargo', name: 'Cargo', desc: 'Utility fit', gradient: 'from-olive-900 to-olive-700' },
  { id: 'shorts', name: 'Shorts', desc: 'Casual shorts', gradient: 'from-amber-900 to-amber-700' },
];

const SHOE_ITEMS = [
  { id: 'sneakers', name: 'Sneakers', desc: 'Sporty', gradient: 'from-emerald-900 to-emerald-700' },
  { id: 'shoes', name: 'Shoes', desc: 'Formal leather', gradient: 'from-neutral-900 to-neutral-700' },
  { id: 'boots', name: 'Boots', desc: 'Rugged', gradient: 'from-amber-900 to-amber-700' },
];

const EYEWEAR_ITEMS = [
  { id: 'none', name: 'None', desc: 'No eyewear', gradient: 'from-gray-800 to-gray-700' },
  { id: 'classic', name: 'Classic', desc: 'Clear frames', gradient: 'from-cyan-900 to-cyan-700' },
  { id: 'aviator', name: 'Aviator', desc: 'Metal frame', gradient: 'from-slate-900 to-slate-700' },
  { id: 'round', name: 'Round', desc: 'Retro round', gradient: 'from-purple-900 to-purple-700' },
  { id: 'sport', name: 'Sport', desc: 'Active style', gradient: 'from-lime-900 to-lime-700' },
];

const HEADWEAR_ITEMS = [
  { id: 'none', name: 'None', desc: 'No headwear', gradient: 'from-gray-800 to-gray-700' },
  { id: 'cap', name: 'Cap', desc: 'Classic cap', gradient: 'from-orange-900 to-orange-700' },
  { id: 'beanie', name: 'Beanie', desc: 'Soft beanie', gradient: 'from-pink-900 to-pink-700' },
  { id: 'fedora', name: 'Fedora', desc: 'Elegant hat', gradient: 'from-stone-900 to-stone-700' },
  { id: 'hood', name: 'Hood', desc: 'Hood up', gradient: 'from-violet-900 to-violet-700' },
];

export default function AvatarBuilderPage() {
  const [activeView, setActiveView] = useState<'create' | 'gallery'>('create');
  const [selectedStyle, setSelectedStyle] = useState<string>('professional');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [generatedAvatars, setGeneratedAvatars] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentAvatar, setCurrentAvatar] = useState<any | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [age, setAge] = useState(28);
  const [presentation, setPresentation] = useState('Androgynous');
  const [bodyType, setBodyType] = useState('Athletic');
  const [skinTone, setSkinTone] = useState('Medium');
  const [hairStyle, setHairStyle] = useState('Medium');
  const [hairColor, setHairColor] = useState('Brown');
  const [eyeColor, setEyeColor] = useState('Brown');
  const [expression, setExpression] = useState('Smile');
  const [pose, setPose] = useState('a-pose');
  const [top, setTop] = useState('jacket');
  const [bottom, setBottom] = useState('jeans');
  const [shoes, setShoes] = useState('sneakers');
  const [eyewear, setEyewear] = useState('none');
  const [headwear, setHeadwear] = useState('none');
  const [accessories, setAccessories] = useState<string[]>([]);
  const [colorway, setColorway] = useState('premium-tech');
  const [lighting, setLighting] = useState('Studio');
  const [extraDetails, setExtraDetails] = useState('');
  const [promptSeed, setPromptSeed] = useState('Premium full-body avatar');
  const [presetName, setPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState<AvatarPreset[]>([]);
  const presetImportRef = useRef<HTMLInputElement>(null);

  const toggleAccessory = (item: string) => {
    setAccessories(prev =>
      prev.includes(item) ? prev.filter(a => a !== item) : [...prev, item]
    );
  };

  const getItemName = (items: { id: string; name: string }[], id: string) =>
    items.find(item => item.id === id)?.name || id;

  const buildPrompt = (basePrompt: string) => {
    const selectedStyleData = AVATAR_STYLES.find(s => s.id === selectedStyle);
    const selectedColorway = COLORWAYS.find(c => c.id === colorway);
    const selectedPose = POSES.find(p => p.id === pose);
    const topName = getItemName(TOP_ITEMS, top);
    const bottomName = getItemName(BOTTOM_ITEMS, bottom);
    const shoesName = getItemName(SHOE_ITEMS, shoes);
    const eyewearName = getItemName(EYEWEAR_ITEMS, eyewear);
    const headwearName = getItemName(HEADWEAR_ITEMS, headwear);

    const accessoryList = [
      ...accessories,
      eyewear !== 'none' ? eyewearName : null,
      headwear !== 'none' ? headwearName : null,
    ].filter(Boolean) as string[];

    const promptParts = [
      selectedStyleData?.prompt,
      basePrompt,
      extraDetails.trim() ? extraDetails.trim() : null,
      `${presentation.toLowerCase()} presentation`,
      'full body, head-to-toe',
      selectedPose?.prompt,
      `${age}-year-old`,
      `${bodyType.toLowerCase()} body`,
      `${skinTone.toLowerCase()} skin tone`,
      `${hairStyle.toLowerCase()} ${hairColor.toLowerCase()} hair`,
      `${eyeColor.toLowerCase()} eyes`,
      `${expression.toLowerCase()} expression`,
      `wearing ${topName.toLowerCase()}, ${bottomName.toLowerCase()}, ${shoesName.toLowerCase()}`,
      accessoryList.length > 0 ? `with ${accessoryList.join(', ')}` : null,
      selectedColorway ? `color palette ${selectedColorway.name}` : null,
      `${lighting.toLowerCase()} lighting`,
      'premium 3D avatar, AAA game quality, clean topology, clothing-friendly',
      'high quality, detailed, professional photography, 4K resolution, centered composition',
      'neutral background, subtle rim light'
    ].filter(Boolean);

    return promptParts.join(', ');
  };

  useEffect(() => {
    const stored = localStorage.getItem('avatar-presets');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AvatarPreset[];
        setSavedPresets(parsed);
      } catch {
        setSavedPresets([]);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('avatar-presets', JSON.stringify(savedPresets));
  }, [savedPresets]);

  const applyPreset = (preset: AvatarPreset) => {
    const data = preset.data;
    setSelectedStyle(data.selectedStyle);
    setAge(data.age);
    setPresentation(data.presentation);
    setBodyType(data.bodyType);
    setSkinTone(data.skinTone);
    setHairStyle(data.hairStyle);
    setHairColor(data.hairColor);
    setEyeColor(data.eyeColor);
    setExpression(data.expression);
    setTop(data.top);
    setBottom(data.bottom);
    setShoes(data.shoes);
    setEyewear(data.eyewear);
    setHeadwear(data.headwear);
    setAccessories(data.accessories || []);
    setColorway(data.colorway);
    setLighting(data.lighting);
    setPose(data.pose);
    setExtraDetails(data.extraDetails || '');
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      return;
    }
    const newPreset: AvatarPreset = {
      id: `${Date.now()}`,
      name: presetName.trim(),
      data: {
        selectedStyle,
        age,
        presentation,
        bodyType,
        skinTone,
        hairStyle,
        hairColor,
        eyeColor,
        expression,
        top,
        bottom,
        shoes,
        eyewear,
        headwear,
        accessories,
        colorway,
        lighting,
        pose,
        extraDetails,
      },
    };
    setSavedPresets(prev => [newPreset, ...prev]);
    setPresetName('');
  };

  const removePreset = (id: string) => {
    setSavedPresets(prev => prev.filter(p => p.id !== id));
  };

  const handleExportPresets = () => {
    const data = JSON.stringify(savedPresets, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'avatar-presets.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportPresets = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as AvatarPreset[];
      if (Array.isArray(imported)) {
        setSavedPresets(prev => [...imported, ...prev]);
      }
    } catch {
      alert('Invalid preset file');
    } finally {
      if (presetImportRef.current) presetImportRef.current.value = '';
    }
  };

  const handleSendMessage = async (message: string, attachments?: File[]) => {
    setIsGenerating(true);
    setGenerationProgress(0);

    // Handle image from attachments if present
    let imageData: string | null = uploadedImage;
    if (attachments && attachments.length > 0) {
      const imageFile = attachments.find(f => f.type.startsWith('image/'));
      if (imageFile) {
        imageData = await fileToBase64(imageFile);
        setUploadedImage(imageData);
      }
    }

    // Create placeholder avatar
    const newAvatar = {
      id: Date.now().toString(),
      prompt: message,
      style: selectedStyle,
      image: null,
      createdAt: new Date(),
      isGenerating: true
    };

    setGeneratedAvatars(prev => [newAvatar, ...prev]);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 5;
      });
    }, 500);

    try {
      console.log('🎨 Generating avatar with prompt:', message);
      
      // Build comprehensive prompt
      const fullPrompt = buildPrompt(message);
      const topName = getItemName(TOP_ITEMS, top);
      const bottomName = getItemName(BOTTOM_ITEMS, bottom);
      const shoesName = getItemName(SHOE_ITEMS, shoes);
      const eyewearName = getItemName(EYEWEAR_ITEMS, eyewear);
      const headwearName = getItemName(HEADWEAR_ITEMS, headwear);
      const normalizedAccessories = [
        ...accessories,
        eyewear !== 'none' ? eyewearName : null,
        headwear !== 'none' ? headwearName : null,
      ].filter(Boolean) as string[];

      const response = await fetch('/api/generate/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: imageData,
          style: {
            artStyle: selectedStyle,
            age,
            hairStyle,
            hairColor,
            eyeColor,
            expression
          },
          fashion: {
            outfit: `${topName}, ${bottomName}, ${shoesName}`,
            accessories: normalizedAccessories
          },
          prompt: fullPrompt
        }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ API error:', errorData);
        throw new Error(errorData.error || 'Failed to generate avatar');
      }

      const data = await response.json();
      console.log('✅ Avatar generated successfully!');

      setGenerationProgress(100);

      // Update avatar with generated image
      setGeneratedAvatars(prev => prev.map(a => 
        a.id === newAvatar.id 
          ? { ...a, image: data.image, isGenerating: false }
          : a
      ));

      setCurrentAvatar({ ...newAvatar, image: data.image, isGenerating: false });

    } catch (error: any) {
      console.error('💥 Avatar generation error:', error);
      
      // Remove placeholder on error
      setGeneratedAvatars(prev => prev.filter(a => a.id !== newAvatar.id));
      
      alert(error.message || 'Failed to generate avatar. Please check your API key and try again.');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      const base64 = await fileToBase64(file);
      setUploadedImage(base64);
      setShowUploadModal(false);
    }
  };

  const handleDownload = async (avatar: any) => {
    if (!avatar.image || avatar.isGenerating) return;
    
    try {
      const link = document.createElement('a');
      link.href = avatar.image;
      link.download = `avatar-${avatar.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download avatar');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <User className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Avatar Builder</h1>
                <p className="text-sm text-gray-400">AI-Powered Avatar Generation</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={activeView === 'create' ? 'default' : 'outline'}
                onClick={() => setActiveView('create')}
                className={activeView === 'create' ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'border-white/10'}
              >
                <Wand2 size={16} className="mr-2" />
                Create
              </Button>
              <Button
                variant={activeView === 'gallery' ? 'default' : 'outline'}
                onClick={() => setActiveView('gallery')}
                className={activeView === 'gallery' ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'border-white/10'}
              >
                <ImageIcon size={16} className="mr-2" />
                Gallery ({generatedAvatars.length})
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {activeView === 'create' ? (
              <>
                {/* Style Selection */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="text-purple-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">Choose Avatar Style</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {AVATAR_STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.id)}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          selectedStyle === style.id
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="text-3xl mb-2">{style.emoji}</div>
                        <div className="text-sm font-semibold text-white">{style.name}</div>
                        <div className="text-xs text-gray-400 mt-1">{style.description}</div>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Identity & Body */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <User className="text-cyan-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">Identity & Body</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Age: {age}</label>
                      <Slider
                        value={[age]}
                        onValueChange={(v) => setAge(v[0])}
                        min={18}
                        max={65}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Body Type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {BODY_TYPES.map((type) => (
                          <button
                            key={type}
                            onClick={() => setBodyType(type)}
                            className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                              bodyType === type
                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                                : 'border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="text-sm text-gray-400 mb-2 block">Skin Tone</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {SKIN_TONES.map((tone) => (
                        <button
                          key={tone}
                          onClick={() => setSkinTone(tone)}
                          className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                            skinTone === tone
                              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                              : 'border-white/10 text-gray-400 hover:border-white/20'
                          }`}
                        >
                          {tone}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Presentation</label>
                      <div className="grid grid-cols-2 gap-2">
                        {PRESENTATIONS.map((item) => (
                          <button
                            key={item}
                            onClick={() => setPresentation(item)}
                            className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                              presentation === item
                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                                : 'border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Pose</label>
                      <div className="grid grid-cols-2 gap-2">
                        {POSES.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setPose(item.id)}
                            className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                              pose === item.id
                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                                : 'border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Hair & Face */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Smile className="text-emerald-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">Hair & Face</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Hair Style</label>
                      <div className="grid grid-cols-2 gap-2">
                        {HAIR_STYLES.map((style) => (
                          <button
                            key={style}
                            onClick={() => setHairStyle(style)}
                            className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                              hairStyle === style
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                                : 'border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                          >
                            {style}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Hair Color</label>
                      <div className="grid grid-cols-3 gap-2">
                        {HAIR_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setHairColor(color)}
                            className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                              hairColor === color
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                                : 'border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                          >
                            {color}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Eye Color</label>
                      <div className="grid grid-cols-3 gap-2">
                        {EYE_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setEyeColor(color)}
                            className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                              eyeColor === color
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                                : 'border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                          >
                            {color}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Expression</label>
                      <div className="grid grid-cols-2 gap-2">
                        {EXPRESSIONS.map((exp) => (
                          <button
                            key={exp}
                            onClick={() => setExpression(exp)}
                            className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                              expression === exp
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                                : 'border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                          >
                            {exp}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Outfit & Accessories */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Shirt className="text-yellow-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">Outfit & Accessories</h3>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Top</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {TOP_ITEMS.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setTop(item.id)}
                            className={`p-3 rounded-xl border transition-all text-left ${
                              top === item.id
                                ? 'border-yellow-500 bg-yellow-500/10'
                                : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}
                          >
                            <div className={`h-16 rounded-lg bg-gradient-to-br ${item.gradient} mb-2`} />
                            <div className="text-sm font-semibold text-white">{item.name}</div>
                            <div className="text-xs text-gray-400">{item.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Bottom</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {BOTTOM_ITEMS.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setBottom(item.id)}
                            className={`p-3 rounded-xl border transition-all text-left ${
                              bottom === item.id
                                ? 'border-yellow-500 bg-yellow-500/10'
                                : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}
                          >
                            <div className={`h-16 rounded-lg bg-gradient-to-br ${item.gradient} mb-2`} />
                            <div className="text-sm font-semibold text-white">{item.name}</div>
                            <div className="text-xs text-gray-400">{item.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Shoes</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {SHOE_ITEMS.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setShoes(item.id)}
                            className={`p-3 rounded-xl border transition-all text-left ${
                              shoes === item.id
                                ? 'border-yellow-500 bg-yellow-500/10'
                                : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}
                          >
                            <div className={`h-16 rounded-lg bg-gradient-to-br ${item.gradient} mb-2`} />
                            <div className="text-sm font-semibold text-white">{item.name}</div>
                            <div className="text-xs text-gray-400">{item.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="text-sm text-gray-400 mb-2 block">Eyewear</label>
                        <div className="grid grid-cols-2 gap-3">
                          {EYEWEAR_ITEMS.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => setEyewear(item.id)}
                              className={`p-3 rounded-xl border transition-all text-left ${
                                eyewear === item.id
                                  ? 'border-yellow-500 bg-yellow-500/10'
                                  : 'border-white/10 bg-white/5 hover:border-white/20'
                              }`}
                            >
                              <div className={`h-12 rounded-lg bg-gradient-to-br ${item.gradient} mb-2`} />
                              <div className="text-xs font-semibold text-white">{item.name}</div>
                              <div className="text-[11px] text-gray-400">{item.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm text-gray-400 mb-2 block">Headwear</label>
                        <div className="grid grid-cols-2 gap-3">
                          {HEADWEAR_ITEMS.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => setHeadwear(item.id)}
                              className={`p-3 rounded-xl border transition-all text-left ${
                                headwear === item.id
                                  ? 'border-yellow-500 bg-yellow-500/10'
                                  : 'border-white/10 bg-white/5 hover:border-white/20'
                              }`}
                            >
                              <div className={`h-12 rounded-lg bg-gradient-to-br ${item.gradient} mb-2`} />
                              <div className="text-xs font-semibold text-white">{item.name}</div>
                              <div className="text-[11px] text-gray-400">{item.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Accessories</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {ACCESSORIES.map((item) => (
                          <button
                            key={item}
                            onClick={() => toggleAccessory(item)}
                            className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                              accessories.includes(item)
                                ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300'
                                : 'border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Colorway & Lighting */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Palette className="text-pink-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">Colorway & Lighting</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                    {COLORWAYS.map((cw) => (
                      <button
                        key={cw.id}
                        onClick={() => setColorway(cw.id)}
                        className={`p-3 rounded-xl border transition-all text-left ${
                          colorway === cw.id
                            ? 'border-pink-500 bg-pink-500/10'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="text-sm font-semibold text-white mb-2">{cw.name}</div>
                        <div className="flex gap-2">
                          {cw.colors.map((color) => (
                            <span
                              key={color}
                              className="w-6 h-6 rounded-full border border-white/10"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Lighting Style</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {LIGHTING_STYLES.map((style) => (
                        <button
                          key={style}
                          onClick={() => setLighting(style)}
                          className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                            lighting === style
                              ? 'border-pink-500 bg-pink-500/10 text-pink-300'
                              : 'border-white/10 text-gray-400 hover:border-white/20'
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>

                {/* Prompt Controls */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Wand2 className="text-blue-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">Prompt Controls</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Prompt Seed</label>
                      <input
                        type="text"
                        value={promptSeed}
                        onChange={(e) => setPromptSeed(e.target.value)}
                        className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50"
                        placeholder="Premium full-body avatar"
                      />
                      <p className="text-xs text-gray-500 mt-2">This is used for prompt preview only.</p>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Extra Details</label>
                      <textarea
                        value={extraDetails}
                        onChange={(e) => setExtraDetails(e.target.value)}
                        className="w-full h-24 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50"
                        placeholder="Add extra details like background, mood, or styling notes..."
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="text-sm text-gray-400 mb-2 block">Prompt Preview</label>
                    <div className="p-3 bg-black/30 border border-white/10 rounded-lg text-xs text-gray-300 whitespace-pre-wrap">
                      {buildPrompt(promptSeed || 'premium avatar')}
                    </div>
                  </div>
                </Card>

                {/* Reference Image Upload (Optional) */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Camera className="text-cyan-400" size={20} />
                      <h3 className="text-lg font-semibold text-white">Reference Photo (Optional)</h3>
                    </div>
                    <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400">
                      Optional
                    </Badge>
                  </div>

                  {uploadedImage ? (
                    <div className="relative group">
                      <img
                        src={uploadedImage}
                        alt="Reference"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => setUploadedImage(null)}
                        className="absolute top-2 right-2 p-2 bg-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={16} className="text-white" />
                      </button>
                    </div>
                  ) : (
                    <label className="block w-full h-48 border-2 border-dashed border-white/20 rounded-lg flex flex-col items-center justify-center hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <Upload size={32} className="text-gray-600 mb-2" />
                      <p className="text-gray-400">Click to upload reference photo</p>
                      <p className="text-xs text-gray-500 mt-1">JPG, PNG up to 10MB</p>
                    </label>
                  )}
                </Card>

                {/* Generation Progress */}
                {isGenerating && (
                  <Card className="p-6 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/30">
                    <div className="flex items-center gap-4">
                      <Loader2 className="animate-spin text-purple-400" size={24} />
                      <div className="flex-1">
                        <div className="text-white font-semibold mb-2">Generating your avatar...</div>
                        <div className="w-full bg-black/20 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-purple-400 to-pink-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${generationProgress}%` }}
                          />
                        </div>
                        <div className="text-sm text-gray-300 mt-2">{generationProgress}% complete</div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Chat Interface */}
                <Card className="bg-black/40 border-white/10 h-[500px]">
                  <ChatInterface
                    onSendMessage={handleSendMessage}
                    placeholder={`Describe the ${AVATAR_STYLES.find(s => s.id === selectedStyle)?.name.toLowerCase()} avatar you want...`}
                    suggestions={SUGGESTIONS}
                    isGenerating={isGenerating}
                  />
                </Card>
              </>
            ) : (
              /* Gallery View */
              <div className="space-y-4">
                {generatedAvatars.length === 0 ? (
                  <Card className="p-12 bg-black/20 border-white/10 text-center">
                    <User className="mx-auto text-gray-600 mb-4" size={48} />
                    <h3 className="text-lg font-semibold text-white mb-2">No avatars yet</h3>
                    <p className="text-gray-400 mb-4">Create your first avatar to get started</p>
                    <Button
                      onClick={() => setActiveView('create')}
                      className="bg-gradient-to-r from-purple-500 to-pink-500"
                    >
                      <Wand2 size={16} className="mr-2" />
                      Create Avatar
                    </Button>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {generatedAvatars.map((avatar) => (
                      <Card 
                        key={avatar.id} 
                        className="p-0 bg-black/40 border-white/10 hover:border-purple-500/30 transition-all overflow-hidden group cursor-pointer"
                        onClick={() => setCurrentAvatar(avatar)}
                      >
                        <div className="relative aspect-square bg-black">
                          {avatar.image ? (
                            <img
                              src={avatar.image}
                              alt={avatar.prompt}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Loader2 className="animate-spin text-purple-400" size={32} />
                            </div>
                          )}
                          {!avatar.isGenerating && avatar.image && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button className="bg-gradient-to-r from-purple-500 to-pink-500">
                                <Eye size={20} />
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="p-3">
                          <p className="text-sm text-white truncate mb-2">{avatar.prompt}</p>
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400">
                              {avatar.style}
                            </Badge>
                            {!avatar.isGenerating && avatar.image && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(avatar);
                                }}
                              >
                                <Download size={14} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar - Preview */}
          <div className="space-y-6">
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
                <Eye size={16} />
                PREVIEW
              </h3>

              {currentAvatar ? (
                <>
                  <div className="relative aspect-square bg-black rounded-lg overflow-hidden mb-4">
                    {currentAvatar.isGenerating ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="animate-spin text-purple-400" size={32} />
                      </div>
                    ) : currentAvatar.image ? (
                      <img
                        src={currentAvatar.image}
                        alt={currentAvatar.prompt}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <User className="text-gray-600" size={48} />
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-gray-400 mb-4">{currentAvatar.prompt}</p>

                  {/* Actions */}
                  {!currentAvatar.isGenerating && currentAvatar.image && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleDownload(currentAvatar)}
                        className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500"
                      >
                        <Download size={16} className="mr-2" />
                        Download
                      </Button>
                      <Button variant="outline" size="icon" className="border-white/10">
                        <Share2 size={16} />
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <User className="mx-auto text-gray-600 mb-4" size={48} />
                  <p className="text-gray-400">No avatar selected</p>
                </div>
              )}
            </Card>

            {/* Quick Tips */}
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">TIPS FOR BEST RESULTS</h3>
              <div className="space-y-3 text-sm text-gray-400">
                <div className="flex items-start gap-2">
                  <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Be specific about desired features and style</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Reference photo improves results (optional)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Try different styles for variety</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Include details like clothing, background</span>
                </div>
              </div>
            </Card>

            {/* Preset Manager */}
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">PRESET MANAGER</h3>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/50"
                    placeholder="Preset name"
                  />
                  <Button
                    onClick={handleSavePreset}
                    className="bg-gradient-to-r from-purple-500 to-pink-500"
                  >
                    <Save size={16} className="mr-2" />
                    Save
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleExportPresets}
                    className="border-white/10 flex-1"
                  >
                    <Download size={16} className="mr-2" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => presetImportRef.current?.click()}
                    className="border-white/10 flex-1"
                  >
                    <Upload size={16} className="mr-2" />
                    Import
                  </Button>
                  <input
                    ref={presetImportRef}
                    type="file"
                    accept="application/json"
                    onChange={handleImportPresets}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                {savedPresets.length === 0 ? (
                  <p className="text-xs text-gray-500">No presets saved yet.</p>
                ) : (
                  savedPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg border border-white/10 bg-black/20"
                    >
                      <button
                        onClick={() => applyPreset(preset)}
                        className="text-left text-sm text-white flex-1 hover:text-purple-300"
                      >
                        {preset.name}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePreset(preset.id)}
                        className="h-7 w-7"
                      >
                        <X size={12} />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Stats */}
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">STATISTICS</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Total Avatars</span>
                  <span className="text-white font-semibold">{generatedAvatars.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">This Month</span>
                  <span className="text-white font-semibold">{generatedAvatars.filter(a => {
                    const now = new Date();
                    return a.createdAt.getMonth() === now.getMonth() && 
                           a.createdAt.getFullYear() === now.getFullYear();
                  }).length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Favorite Style</span>
                  <span className="text-white font-semibold capitalize">
                    {generatedAvatars.length > 0 
                      ? generatedAvatars[0].style 
                      : '-'}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
