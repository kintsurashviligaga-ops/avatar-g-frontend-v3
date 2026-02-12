"use client";

import { useEffect, useRef, useState } from 'react';
import { 
  User, Camera, Sparkles, Upload, Download, Share2, Wand2, 
  Loader2, Check, X, Image as ImageIcon,
  Palette, Shirt, Eye, Smile, Save, Music
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ChatWindow } from '@/components/ui/ChatWindow';
import { PromptBuilder } from '@/components/ui/PromptBuilder';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useStudioStore } from '@/store/useStudioStore';
import type { Avatar } from '@/types/platform';
import { getAuthHeaders } from '@/lib/auth/client';
import { getOwnerId } from '@/lib/auth/identity';

interface AvatarStyle {
  id: string;
  nameKey: string;
  emoji: string;
  descriptionKey: string;
  prompt: string;
}

interface AvatarPreset {
  id: string;
  name: string;
  category: string;
  tags: string[];
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

type GeneratedAvatar = {
  id: string;
  prompt: string;
  style: string;
  image: string | null;
  createdAt: Date;
  isGenerating: boolean;
};

const AVATAR_STYLES: AvatarStyle[] = [
  { id: 'professional', nameKey: 'avatar.style.professional', emoji: '💼', descriptionKey: 'avatar.style.professional.desc', prompt: 'professional business portrait, formal attire, confident expression, studio lighting' },
  { id: 'casual', nameKey: 'avatar.style.casual', emoji: '😊', descriptionKey: 'avatar.style.casual.desc', prompt: 'casual portrait, relaxed expression, natural lighting, approachable' },
  { id: 'artistic', nameKey: 'avatar.style.artistic', emoji: '🎨', descriptionKey: 'avatar.style.artistic.desc', prompt: 'artistic portrait, creative styling, artistic lighting, expressive' },
  { id: 'cinematic', nameKey: 'avatar.style.cinematic', emoji: '🎬', descriptionKey: 'avatar.style.cinematic.desc', prompt: 'cinematic portrait, dramatic lighting, film quality, professional' },
  { id: 'anime', nameKey: 'avatar.style.anime', emoji: '✨', descriptionKey: 'avatar.style.anime.desc', prompt: 'anime style portrait, vibrant colors, stylized features, high detail' },
  { id: 'cartoon', nameKey: 'avatar.style.cartoon', emoji: '🎭', descriptionKey: 'avatar.style.cartoon.desc', prompt: '3D cartoon style, colorful, stylized, fun and playful' },
  { id: 'cyberpunk', nameKey: 'avatar.style.cyberpunk', emoji: '🤖', descriptionKey: 'avatar.style.cyberpunk.desc', prompt: 'cyberpunk style, neon lights, futuristic, tech aesthetic' },
  { id: 'fantasy', nameKey: 'avatar.style.fantasy', emoji: '🧙', descriptionKey: 'avatar.style.fantasy.desc', prompt: 'fantasy style portrait, magical, ethereal, mystical atmosphere' },
];

const SUGGESTIONS = [
  'avatar.suggestion.1',
  'avatar.suggestion.2',
  'avatar.suggestion.3',
  'avatar.suggestion.4',
  'avatar.suggestion.5',
  'avatar.suggestion.6',
];

const BODY_TYPES = ['Slim', 'Athletic', 'Average', 'Curvy', 'Muscular'];
const PRESENTATIONS = ['Feminine', 'Masculine', 'Androgynous'];
const PRESET_CATEGORIES = ['Professional', 'Casual', 'Studio', 'Cinematic', 'Fantasy', 'Street'];
const PRESET_TAGS = ['HQ', 'Studio', 'Street', 'Clean', 'Futuristic', 'Minimal', 'Warm', 'Cool'];
const POSES = [
  { id: 'a-pose', nameKey: 'avatar.pose.apose', prompt: 'neutral A-pose', descKey: 'avatar.pose.apose.desc', gradient: 'from-slate-900 to-slate-700' },
  { id: 't-pose', nameKey: 'avatar.pose.tpose', prompt: 'neutral T-pose', descKey: 'avatar.pose.tpose.desc', gradient: 'from-zinc-900 to-zinc-700' },
  { id: 'relaxed', nameKey: 'avatar.pose.relaxed', prompt: 'relaxed standing pose', descKey: 'avatar.pose.relaxed.desc', gradient: 'from-emerald-900 to-emerald-700' },
  { id: 'confident', nameKey: 'avatar.pose.confident', prompt: 'confident pose, shoulders back', descKey: 'avatar.pose.confident.desc', gradient: 'from-indigo-900 to-indigo-700' },
  { id: 'hands-on-hips', nameKey: 'avatar.pose.handsOnHips', prompt: 'hands on hips pose', descKey: 'avatar.pose.handsOnHips.desc', gradient: 'from-amber-900 to-amber-700' },
];
const SKIN_TONES = ['Light', 'Medium', 'Tan', 'Deep'];
const HAIR_STYLES = ['Short', 'Medium', 'Long', 'Curly', 'Buzz'];
const HAIR_COLORS = ['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Blue'];
const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Gray', 'Amber', 'Hazel'];
const EXPRESSIONS = ['Neutral', 'Smile', 'Serious', 'Confident', 'Friendly'];
const ACCESSORIES = ['Earrings', 'Necklace', 'Watch', 'Bracelet', 'Ring'];
const LIGHTING_STYLES = ['Studio', 'Cinematic', 'Soft Daylight', 'Neon'];

const COLORWAYS = [
  { id: 'premium-tech', name: 'Premium Tech', nameKey: 'avatar.colorway.premiumTech', colors: ['#2B2D31', '#F2F2F2', '#21D4FD'] },
  { id: 'urban-classic', name: 'Urban Classic', nameKey: 'avatar.colorway.urbanClassic', colors: ['#1E1E1E', '#6C7280', '#F59E0B'] },
  { id: 'modern-soft', name: 'Modern Soft', nameKey: 'avatar.colorway.modernSoft', colors: ['#0F172A', '#E5E7EB', '#10B981'] },
];

const SCAN_STEPS = [
  { id: 'front', labelKey: 'avatar.scan.front', hintKey: 'avatar.scan.front.hint' },
  { id: 'left', labelKey: 'avatar.scan.left', hintKey: 'avatar.scan.left.hint' },
  { id: 'right', labelKey: 'avatar.scan.right', hintKey: 'avatar.scan.right.hint' },
  { id: 'up', labelKey: 'avatar.scan.up', hintKey: 'avatar.scan.up.hint' },
  { id: 'down', labelKey: 'avatar.scan.down', hintKey: 'avatar.scan.down.hint' },
];

const OUTFIT_BUNDLES = [
  {
    id: 'executive-classic',
    name: 'Executive Classic',
    nameKey: 'avatar.bundle.executive',
    desc: 'Premium suit + leather shoes',
    descKey: 'avatar.bundle.executive.desc',
    top: 'suit',
    bottom: 'pants',
    shoes: 'shoes',
    eyewear: 'classic',
    headwear: 'none',
    accessories: ['Watch'],
  },
  {
    id: 'street-flex',
    name: 'Street Flex',
    nameKey: 'avatar.bundle.street',
    desc: 'Hoodie + cargo + sneakers',
    descKey: 'avatar.bundle.street.desc',
    top: 'hoodie',
    bottom: 'cargo',
    shoes: 'sneakers',
    eyewear: 'sport',
    headwear: 'cap',
    accessories: ['Bracelet'],
  },
  {
    id: 'modern-minimal',
    name: 'Modern Minimal',
    nameKey: 'avatar.bundle.modern',
    desc: 'T-shirt + jeans + sneakers',
    descKey: 'avatar.bundle.modern.desc',
    top: 'tshirt',
    bottom: 'jeans',
    shoes: 'sneakers',
    eyewear: 'none',
    headwear: 'none',
    accessories: [],
  },
  {
    id: 'creative-artist',
    name: 'Creative Artist',
    nameKey: 'avatar.bundle.creative',
    desc: 'Jacket + pants + boots',
    descKey: 'avatar.bundle.creative.desc',
    top: 'jacket',
    bottom: 'pants',
    shoes: 'boots',
    eyewear: 'round',
    headwear: 'beanie',
    accessories: ['Necklace'],
  },
];

const TOP_ITEMS = [
  { id: 'jacket', name: 'Jacket', nameKey: 'avatar.outfit.top.jacket', desc: 'Clean tech jacket', descKey: 'avatar.outfit.top.jacket.desc', gradient: 'from-slate-800 to-slate-600' },
  { id: 'hoodie', name: 'Hoodie', nameKey: 'avatar.outfit.top.hoodie', desc: 'Street hoodie', descKey: 'avatar.outfit.top.hoodie.desc', gradient: 'from-zinc-800 to-zinc-600' },
  { id: 'tshirt', name: 'T-shirt', nameKey: 'avatar.outfit.top.tshirt', desc: 'Minimal tee', descKey: 'avatar.outfit.top.tshirt.desc', gradient: 'from-gray-700 to-gray-500' },
  { id: 'suit', name: 'Formal Suit', nameKey: 'avatar.outfit.top.suit', desc: 'Premium suit', descKey: 'avatar.outfit.top.suit.desc', gradient: 'from-neutral-900 to-neutral-700' },
  { id: 'streetwear', name: 'Streetwear', nameKey: 'avatar.outfit.top.streetwear', desc: 'Urban fit', descKey: 'avatar.outfit.top.streetwear.desc', gradient: 'from-indigo-900 to-indigo-700' },
];

const BOTTOM_ITEMS = [
  { id: 'jeans', name: 'Jeans', nameKey: 'avatar.outfit.bottom.jeans', desc: 'Slim denim', descKey: 'avatar.outfit.bottom.jeans.desc', gradient: 'from-blue-900 to-blue-700' },
  { id: 'pants', name: 'Pants', nameKey: 'avatar.outfit.bottom.pants', desc: 'Tailored pants', descKey: 'avatar.outfit.bottom.pants.desc', gradient: 'from-stone-800 to-stone-600' },
  { id: 'cargo', name: 'Cargo', nameKey: 'avatar.outfit.bottom.cargo', desc: 'Utility fit', descKey: 'avatar.outfit.bottom.cargo.desc', gradient: 'from-olive-900 to-olive-700' },
  { id: 'shorts', name: 'Shorts', nameKey: 'avatar.outfit.bottom.shorts', desc: 'Casual shorts', descKey: 'avatar.outfit.bottom.shorts.desc', gradient: 'from-amber-900 to-amber-700' },
];

const SHOE_ITEMS = [
  { id: 'sneakers', name: 'Sneakers', nameKey: 'avatar.outfit.shoes.sneakers', desc: 'Sporty', descKey: 'avatar.outfit.shoes.sneakers.desc', gradient: 'from-emerald-900 to-emerald-700' },
  { id: 'shoes', name: 'Shoes', nameKey: 'avatar.outfit.shoes.shoes', desc: 'Formal leather', descKey: 'avatar.outfit.shoes.shoes.desc', gradient: 'from-neutral-900 to-neutral-700' },
  { id: 'boots', name: 'Boots', nameKey: 'avatar.outfit.shoes.boots', desc: 'Rugged', descKey: 'avatar.outfit.shoes.boots.desc', gradient: 'from-amber-900 to-amber-700' },
];

const EYEWEAR_ITEMS = [
  { id: 'none', name: 'None', nameKey: 'avatar.outfit.eyewear.none', desc: 'No eyewear', descKey: 'avatar.outfit.eyewear.none.desc', gradient: 'from-gray-800 to-gray-700' },
  { id: 'classic', name: 'Classic', nameKey: 'avatar.outfit.eyewear.classic', desc: 'Clear frames', descKey: 'avatar.outfit.eyewear.classic.desc', gradient: 'from-cyan-900 to-cyan-700' },
  { id: 'aviator', name: 'Aviator', nameKey: 'avatar.outfit.eyewear.aviator', desc: 'Metal frame', descKey: 'avatar.outfit.eyewear.aviator.desc', gradient: 'from-slate-900 to-slate-700' },
  { id: 'round', name: 'Round', nameKey: 'avatar.outfit.eyewear.round', desc: 'Retro round', descKey: 'avatar.outfit.eyewear.round.desc', gradient: 'from-purple-900 to-purple-700' },
  { id: 'sport', name: 'Sport', nameKey: 'avatar.outfit.eyewear.sport', desc: 'Active style', descKey: 'avatar.outfit.eyewear.sport.desc', gradient: 'from-lime-900 to-lime-700' },
];

const HEADWEAR_ITEMS = [
  { id: 'none', name: 'None', nameKey: 'avatar.outfit.headwear.none', desc: 'No headwear', descKey: 'avatar.outfit.headwear.none.desc', gradient: 'from-gray-800 to-gray-700' },
  { id: 'cap', name: 'Cap', nameKey: 'avatar.outfit.headwear.cap', desc: 'Classic cap', descKey: 'avatar.outfit.headwear.cap.desc', gradient: 'from-orange-900 to-orange-700' },
  { id: 'beanie', name: 'Beanie', nameKey: 'avatar.outfit.headwear.beanie', desc: 'Soft beanie', descKey: 'avatar.outfit.headwear.beanie.desc', gradient: 'from-pink-900 to-pink-700' },
  { id: 'fedora', name: 'Fedora', nameKey: 'avatar.outfit.headwear.fedora', desc: 'Elegant hat', descKey: 'avatar.outfit.headwear.fedora.desc', gradient: 'from-stone-900 to-stone-700' },
  { id: 'hood', name: 'Hood', nameKey: 'avatar.outfit.headwear.hood', desc: 'Hood up', descKey: 'avatar.outfit.headwear.hood.desc', gradient: 'from-violet-900 to-violet-700' },
];

export default function AvatarBuilderPage() {
  const { t } = useLanguage();
  const store = useStudioStore();
  const [activeView, setActiveView] = useState<'create' | 'gallery'>('create');
  const [selectedStyle, setSelectedStyle] = useState<string>('professional');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [generatedAvatars, setGeneratedAvatars] = useState<GeneratedAvatar[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentAvatar, setCurrentAvatar] = useState<GeneratedAvatar | null>(null);
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
  const [promptSeed, setPromptSeed] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presetCategory, setPresetCategory] = useState('Professional');
  const [presetTags, setPresetTags] = useState<string[]>(['HQ']);
  const [presetCategoryFilter, setPresetCategoryFilter] = useState('All');
  const [presetTagFilter, setPresetTagFilter] = useState('All');
  const [savedPresets, setSavedPresets] = useState<AvatarPreset[]>([]);
  const presetImportRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [scanImages, setScanImages] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [savedAvatars, setSavedAvatars] = useState<Avatar[]>([]);
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(false);
  const [avatarNameInput, setAvatarNameInput] = useState('');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');

  // Load saved avatars from API on mount
  useEffect(() => {
    const loadSavedAvatars = async () => {
      setIsLoadingAvatars(true);
      try {
        const headers = await getAuthHeaders();
        const response = await fetch('/api/avatars', { headers });
        if (response.ok) {
          const data = await response.json();
          setSavedAvatars(data.avatars || []);
        }
      } catch (error) {
        console.error('Error loading saved avatars:', error);
      } finally {
        setIsLoadingAvatars(false);
      }
    };
    loadSavedAvatars();
  }, []);

  // Cleanup: stop camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const presentationLabels: Record<string, string> = {
    Feminine: t('avatar.presentation.feminine'),
    Masculine: t('avatar.presentation.masculine'),
    Androgynous: t('avatar.presentation.androgynous'),
  };

  const skinToneLabels: Record<string, string> = {
    Light: t('avatar.skin.light'),
    Medium: t('avatar.skin.medium'),
    Tan: t('avatar.skin.tan'),
    Deep: t('avatar.skin.deep'),
  };

  const hairStyleLabels: Record<string, string> = {
    Short: t('avatar.hair.short'),
    Medium: t('avatar.hair.medium'),
    Long: t('avatar.hair.long'),
    Curly: t('avatar.hair.curly'),
    Buzz: t('avatar.hair.buzz'),
  };

  const hairColorLabels: Record<string, string> = {
    Black: t('avatar.hairColor.black'),
    Brown: t('avatar.hairColor.brown'),
    Blonde: t('avatar.hairColor.blonde'),
    Red: t('avatar.hairColor.red'),
    Gray: t('avatar.hairColor.gray'),
    White: t('avatar.hairColor.white'),
    Blue: t('avatar.hairColor.blue'),
  };

  const eyeColorLabels: Record<string, string> = {
    Brown: t('avatar.eyeColor.brown'),
    Blue: t('avatar.eyeColor.blue'),
    Green: t('avatar.eyeColor.green'),
    Gray: t('avatar.eyeColor.gray'),
    Amber: t('avatar.eyeColor.amber'),
    Hazel: t('avatar.eyeColor.hazel'),
  };

  const expressionLabels: Record<string, string> = {
    Neutral: t('avatar.expression.neutral'),
    Smile: t('avatar.expression.smile'),
    Serious: t('avatar.expression.serious'),
    Confident: t('avatar.expression.confident'),
    Friendly: t('avatar.expression.friendly'),
  };

  const accessoryLabels: Record<string, string> = {
    Earrings: t('avatar.accessories.earrings'),
    Necklace: t('avatar.accessories.necklace'),
    Watch: t('avatar.accessories.watch'),
    Bracelet: t('avatar.accessories.bracelet'),
    Ring: t('avatar.accessories.ring'),
  };

  const lightingLabels: Record<string, string> = {
    Studio: t('avatar.lighting.studio'),
    Cinematic: t('avatar.lighting.cinematic'),
    'Soft Daylight': t('avatar.lighting.softDaylight'),
    Neon: t('avatar.lighting.neon'),
  };

  const presetCategoryLabels: Record<string, string> = {
    Professional: t('avatar.preset.category.professional'),
    Casual: t('avatar.preset.category.casual'),
    Studio: t('avatar.preset.category.studio'),
    Cinematic: t('avatar.preset.category.cinematic'),
    Fantasy: t('avatar.preset.category.fantasy'),
    Street: t('avatar.preset.category.street'),
  };

  const presetTagLabels: Record<string, string> = {
    HQ: t('avatar.preset.tag.hq'),
    Studio: t('avatar.preset.tag.studio'),
    Street: t('avatar.preset.tag.street'),
    Clean: t('avatar.preset.tag.clean'),
    Futuristic: t('avatar.preset.tag.futuristic'),
    Minimal: t('avatar.preset.tag.minimal'),
    Warm: t('avatar.preset.tag.warm'),
    Cool: t('avatar.preset.tag.cool'),
  };

  const suggestionLabels = SUGGESTIONS.map((key) => t(key));

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
      scanImages.length > 0 ? 'face scan reference from multiple angles' : null,
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
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('preset');
    if (!encoded) return;
    try {
      const json = atob(decodeURIComponent(encoded));
      const preset = JSON.parse(json) as AvatarPreset;
      applyPreset(preset);
    } catch {
      // Ignore invalid preset query
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('avatar-presets', JSON.stringify(savedPresets));
  }, [savedPresets]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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
      category: presetCategory,
      tags: presetTags,
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
      alert(t('avatar.error.invalidPreset'));
    } finally {
      if (presetImportRef.current) presetImportRef.current.value = '';
    }
  };

  const togglePresetTag = (tag: string) => {
    setPresetTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const startFaceScan = async () => {
    // Guard: Client-side only
    if (typeof window === 'undefined') {
      setScanError(t('avatar.error.clientOnly'));
      return;
    }

    // Guard: HTTPS required (except localhost)
    if (!window.location.protocol.startsWith('https') && !window.location.hostname.includes('localhost')) {
      setScanError(t('avatar.error.httpsRequired') || 'Camera requires HTTPS connection');
      return;
    }

    setScanError(null);
    setScanImages([]);
    setScanStepIndex(0);

    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setScanError(t('avatar.error.cameraNotSupported') || 'Your device does not support camera access');
        return;
      }

      // Request camera with specific constraints for better iPad/Safari compatibility
      const constraints = {
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      let stream: MediaStream | null = null;
      
      try {
        // Try with ideal constraints first
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // Fallback: Try with minimal constraints for Safari
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false,
          });
        } catch {
          // Last resort: Try basic video constraint
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      if (!stream) {
        setScanError(t('avatar.error.cameraDenied') || 'Could not access camera');
        return;
      }

      streamRef.current = stream;

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Handle play promise for better error handling
        try {
          await videoRef.current.play();
        } catch {
          // Some browsers might delay play
          setScanError(t('avatar.error.cameraPlayError') || 'Could not start camera stream');
          stream.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          return;
        }
      }

      setIsScanning(true);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : 'Camera access failed';
      // Handle specific error types
      if (errorName === 'NotAllowedError') {
        setScanError(t('avatar.error.permissionDenied') || 'Camera permission was denied. Please enable it in settings.');
      } else if (errorName === 'NotFoundError' || errorName === 'NotSupportedError') {
        setScanError(t('avatar.error.cameraNotFound') || 'No camera device found on this device');
      } else {
        setScanError(t('avatar.error.cameraDenied') || 'Camera access failed. Please try again.');
      }
      setIsScanning(false);
      console.error('Camera error:', errorName, errorMessage);
    }
  };

  const stopFaceScan = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    streamRef.current = null;
    setIsScanning(false);
  };

  const captureFaceScan = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setScanImages(prev => [...prev, dataUrl]);

    if (scanStepIndex >= SCAN_STEPS.length - 1) {
      stopFaceScan();
      if (!uploadedImage) {
        setUploadedImage(dataUrl);
      }
    } else {
      setScanStepIndex(prev => prev + 1);
    }
  };

  const resetFaceScan = () => {
    stopFaceScan();
    setScanImages([]);
    setScanStepIndex(0);
    setScanError(null);
  };

  const applyOutfitBundle = (bundle: typeof OUTFIT_BUNDLES[number]) => {
    setTop(bundle.top);
    setBottom(bundle.bottom);
    setShoes(bundle.shoes);
    setEyewear(bundle.eyewear);
    setHeadwear(bundle.headwear);
    setAccessories(bundle.accessories);
  };

  const handleSharePreset = (preset: AvatarPreset) => {
    if (typeof window === 'undefined') return;
    const data = JSON.stringify(preset);
    const encoded = encodeURIComponent(btoa(data));
    const url = `${window.location.origin}${window.location.pathname}?preset=${encoded}`;
    navigator.clipboard.writeText(url).catch(() => {
      // no-op
    });
  };

  const handleSendMessage = async (message: string, attachments?: File[]) => {
    setIsGenerating(true);
    setGenerationProgress(0);

    // Handle image from attachments if present
    let imageData: string | null = uploadedImage || (scanImages[0] ?? null);
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
        throw new Error(errorData.error || 'Failed to generate avatar');
      }

      const data = await response.json();

      setGenerationProgress(100);

      // Update avatar with generated image
      setGeneratedAvatars(prev => prev.map(a => 
        a.id === newAvatar.id 
          ? { ...a, image: data.image, isGenerating: false }
          : a
      ));

      setCurrentAvatar({ ...newAvatar, image: data.image, isGenerating: false });

      // Auto-save avatar to Supabase persistence layer
      try {
        const ownerId = await getOwnerId();
        await fetch('/api/avatars/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            owner_id: ownerId,
            preview_image_url: data.image || null,
            model_url: null, // Will be populated when user exports 3D model
            name: `Avatar ${new Date().toLocaleDateString()}`,
          }),
        });
        // Success - avatar saved to Supabase
      } catch (error) {
        console.error('Failed to persist avatar to Supabase:', error);
        // Non-critical: avatar still displays locally even if save fails
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : t('avatar.error.generateFailed');
      
      // Remove placeholder on error
      setGeneratedAvatars(prev => prev.filter(a => a.id !== newAvatar.id));
      
      alert(message);
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
        alert(t('avatar.error.fileTooLarge'));
        return;
      }
      const base64 = await fileToBase64(file);
      setUploadedImage(base64);
    }
  };

  const handleDownload = async (avatar: GeneratedAvatar) => {
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
      alert(t('avatar.error.downloadFailed'));
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
                <h1 className="text-xl font-bold text-white">{t('avatar.builder.title')}</h1>
                <p className="text-sm text-gray-400">{t('avatar.builder.subtitle')}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={activeView === 'create' ? 'default' : 'outline'}
                onClick={() => setActiveView('create')}
                className={activeView === 'create' ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'border-white/10'}
              >
                <Wand2 size={16} className="mr-2" />
                {t('avatar.view.create')}
              </Button>
              <Button
                variant={activeView === 'gallery' ? 'default' : 'outline'}
                onClick={() => setActiveView('gallery')}
                className={activeView === 'gallery' ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'border-white/10'}
              >
                <ImageIcon size={16} className="mr-2" />
                {t('avatar.view.gallery')} ({generatedAvatars.length})
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
                    <h3 className="text-lg font-semibold text-white">{t('avatar.styles.title')}</h3>
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
                        <div className="text-sm font-semibold text-white">{t(style.nameKey)}</div>
                        <div className="text-xs text-gray-400 mt-1">{t(style.descriptionKey)}</div>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Identity & Body */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <User className="text-cyan-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">{t('avatar.section.identity')}</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.age')}: {age}</label>
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
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.bodyType')}</label>
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
                            {bodyTypeLabels[type] || type}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.skinTone')}</label>
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
                          {skinToneLabels[tone] || tone}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.presentation')}</label>
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
                            {presentationLabels[item] || item}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.pose')}</label>
                      <div className="grid grid-cols-2 gap-3">
                        {POSES.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setPose(item.id)}
                            className={`p-3 rounded-xl border transition-all text-left ${
                              pose === item.id
                                ? 'border-cyan-500 bg-cyan-500/10'
                                : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}
                          >
                            <div className={`h-12 rounded-lg bg-gradient-to-br ${item.gradient} mb-2`} />
                            <div className="text-sm font-semibold text-white">{t(item.nameKey)}</div>
                            <div className="text-xs text-gray-400">{t(item.descKey)}</div>
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
                    <h3 className="text-lg font-semibold text-white">{t('avatar.section.hairFace')}</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.hairStyle')}</label>
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
                            {hairStyleLabels[style] || style}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.hairColor')}</label>
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
                            {hairColorLabels[color] || color}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.eyeColor')}</label>
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
                            {eyeColorLabels[color] || color}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.expression')}</label>
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
                            {expressionLabels[exp] || exp}
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
                    <h3 className="text-lg font-semibold text-white">{t('avatar.section.outfit')}</h3>
                  </div>

                  <div className="mb-6 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="border-white/10"
                      onClick={() => {
                        const outfitPack = {
                          top,
                          bottom,
                          shoes,
                          eyewear,
                          headwear,
                          accessories,
                        };
                        const blob = new Blob([JSON.stringify(outfitPack, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'outfit-pack.json';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download size={16} className="mr-2" />
                      {t('avatar.label.exportOutfit')}
                    </Button>
                  </div>

                  <div className="mb-6">
                    <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.outfitBundles')}</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {OUTFIT_BUNDLES.map((bundle) => (
                        <button
                          key={bundle.id}
                          onClick={() => applyOutfitBundle(bundle)}
                          className="p-4 rounded-xl border border-white/10 bg-white/5 hover:border-yellow-500/40 transition-all text-left"
                        >
                          <div className="text-sm font-semibold text-white">{t(bundle.nameKey)}</div>
                          <div className="text-xs text-gray-400 mt-1">{t(bundle.descKey)}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.top')}</label>
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
                            <div className="text-sm font-semibold text-white">{t(item.nameKey)}</div>
                            <div className="text-xs text-gray-400">{t(item.descKey)}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.bottom')}</label>
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
                            <div className="text-sm font-semibold text-white">{t(item.nameKey)}</div>
                            <div className="text-xs text-gray-400">{t(item.descKey)}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.shoes')}</label>
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
                            <div className="text-sm font-semibold text-white">{t(item.nameKey)}</div>
                            <div className="text-xs text-gray-400">{t(item.descKey)}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.eyewear')}</label>
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
                              <div className="text-xs font-semibold text-white">{t(item.nameKey)}</div>
                              <div className="text-[11px] text-gray-400">{t(item.descKey)}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.headwear')}</label>
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
                              <div className="text-xs font-semibold text-white">{t(item.nameKey)}</div>
                              <div className="text-[11px] text-gray-400">{t(item.descKey)}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.accessories')}</label>
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
                            {accessoryLabels[item] || item}
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
                    <h3 className="text-lg font-semibold text-white">{t('avatar.section.colorway')}</h3>
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
                        <div className="text-sm font-semibold text-white mb-2">{t(cw.nameKey)}</div>
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
                    <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.lightingStyle')}</label>
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
                          {lightingLabels[style] || style}
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>

                {/* Prompt Controls */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Wand2 className="text-blue-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">{t('avatar.section.prompt')}</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.promptSeed')}</label>
                      <input
                        type="text"
                        value={promptSeed}
                        onChange={(e) => setPromptSeed(e.target.value)}
                        className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50"
                        placeholder={t('avatar.placeholder.promptSeed')}
                      />
                      <p className="text-xs text-gray-500 mt-2">{t('avatar.hint.promptSeed')}</p>
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.extraDetails')}</label>
                      <textarea
                        value={extraDetails}
                        onChange={(e) => setExtraDetails(e.target.value)}
                        className="w-full h-24 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50"
                        placeholder={t('avatar.hint.extraDetails')}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="text-sm text-gray-400 mb-2 block">{t('avatar.label.promptPreview')}</label>
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
                      <h3 className="text-lg font-semibold text-white">{t('avatar.section.reference')}</h3>
                    </div>
                    <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400">
                      {t('avatar.label.referenceOptional')}
                    </Badge>
                  </div>

                  {uploadedImage ? (
                    <div className="relative group">
                      <img
                        src={uploadedImage}
                        alt={t('avatar.section.reference')}
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
                      <p className="text-gray-400">{t('avatar.hint.referenceUpload')}</p>
                      <p className="text-xs text-gray-500 mt-1">{t('avatar.hint.referenceSize')}</p>
                    </label>
                  )}
                </Card>

                {/* Face Scan */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Camera className="text-purple-400" size={20} />
                      <h3 className="text-lg font-semibold text-white">{t('avatar.section.faceScan')}</h3>
                    </div>
                    <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-300">
                      {t('avatar.label.faceScanBeta')}
                    </Badge>
                  </div>

                  {scanError && (
                    <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                      <p className="text-sm text-red-300 mb-3">{scanError}</p>
                      <Button
                        onClick={startFaceScan}
                        className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
                        size="sm"
                      >
                        <Camera size={16} className="mr-2" />
                        {t('avatar.label.retryScan') || 'Retry Camera'}
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
                        {isScanning ? (
                          <video ref={videoRef} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                            {t('avatar.label.cameraPreview')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="text-sm text-gray-400">
                          {t('avatar.label.step')} {Math.min(scanStepIndex + 1, SCAN_STEPS.length)} {t('avatar.label.of')} {SCAN_STEPS.length}:
                          <span className="text-white ml-2">
                            {t(SCAN_STEPS[Math.min(scanStepIndex, SCAN_STEPS.length - 1)].labelKey)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {t(SCAN_STEPS[Math.min(scanStepIndex, SCAN_STEPS.length - 1)].hintKey)}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        {!isScanning ? (
                          <Button onClick={startFaceScan} className="bg-gradient-to-r from-purple-500 to-pink-500">
                            {t('avatar.label.startScan')}
                          </Button>
                        ) : (
                          <Button onClick={captureFaceScan} className="bg-gradient-to-r from-purple-500 to-pink-500">
                            {t('avatar.label.capture')}
                          </Button>
                        )}
                        <Button variant="outline" onClick={resetFaceScan} className="border-white/10">
                          {t('avatar.label.reset')}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-gray-400 mb-2">{t('avatar.label.capturedAngles')}</div>
                      <div className="grid grid-cols-5 gap-2">
                        {SCAN_STEPS.map((step, index) => (
                          <div
                            key={step.id}
                            className="aspect-square rounded-lg border border-white/10 bg-black/20 overflow-hidden"
                          >
                            {scanImages[index] ? (
                              <img src={scanImages[index]} alt={t(step.labelKey)} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500">
                                {t(step.labelKey)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-3">
                        {t('avatar.hint.faceScan')}
                      </p>
                    </div>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </Card>

                {/* Generation Progress */}
                {isGenerating && (
                  <Card className="p-6 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/30">
                    <div className="flex items-center gap-4">
                      <Loader2 className="animate-spin text-purple-400" size={24} />
                      <div className="flex-1">
                        <div className="text-white font-semibold mb-2">{t('avatar.label.generating')}</div>
                        <div className="w-full bg-black/20 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-purple-400 to-pink-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${generationProgress}%` }}
                          />
                        </div>
                        <div className="text-sm text-gray-300 mt-2">{generationProgress}{t('avatar.label.complete')}</div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Prompt Builder & Chat */}
                <div className="space-y-4">
                  <PromptBuilder
                    serviceType="avatar"
                    onApplyPrompt={(prompt) => {
                      setPromptSeed(prompt);
                      handleSendMessage(prompt);
                    }}
                  />
                  <Card className="bg-black/40 border-white/10 overflow-hidden">
                    <ChatWindow
                      title="Avatar Assistant"
                      serviceContext="avatar"
                      height="md"
                      minimizable
                      collapsible
                      onSendMessage={async (message, context) => {
                        setIsChatLoading(true);
                        try {
                          const response = await fetch('/api/chat', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              ...(await getAuthHeaders())
                            },
                            body: JSON.stringify({
                              message,
                              context,
                              conversationId: `avatar_${Date.now()}`
                            })
                          });
                          if (response.ok) {
                            const data = await response.json();
                            // Response is handled by ChatWindow component internally
                          }
                        } finally {
                          setIsChatLoading(false);
                        }
                      }}
                      isLoading={isChatLoading}
                    />
                  </Card>
                </div>
              </>
            ) : (
              /* Gallery View */
              <div className="space-y-4">
                {generatedAvatars.length === 0 ? (
                  <Card className="p-12 bg-black/20 border-white/10 text-center">
                    <User className="mx-auto text-gray-600 mb-4" size={48} />
                    <h3 className="text-lg font-semibold text-white mb-2">{t('avatar.label.noAvatars')}</h3>
                    <p className="text-gray-400 mb-4">{t('avatar.label.noAvatarsHint')}</p>
                    <Button
                      onClick={() => setActiveView('create')}
                      className="bg-gradient-to-r from-purple-500 to-pink-500"
                    >
                      <Wand2 size={16} className="mr-2" />
                      {t('avatar.label.createAvatar')}
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
                {t('avatar.section.preview').toUpperCase()}
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
                        {t('avatar.label.download')}
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
                  <p className="text-gray-400">{t('avatar.label.noAvatarSelected')}</p>
                </div>
              )}
            </Card>

            {/* Save Avatar Panel */}
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
                <Save size={16} className="text-purple-400" />
                {t('avatar.section.save').toUpperCase()}
              </h3>
              {currentAvatar && currentAvatar.image && !currentAvatar.isGenerating ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder={t('avatar.label.avatarName')}
                    value={avatarNameInput}
                    onChange={(e) => setAvatarNameInput(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                  <Button
                    onClick={async () => {
                      // Save avatar via API
                      if (currentAvatar.image && avatarNameInput.trim()) {
                        try {
                          const headers = await getAuthHeaders();
                          const response = await fetch('/api/avatar/save', {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                              title: avatarNameInput.trim(),
                              description: currentAvatar.prompt,
                              style: currentAvatar.style,
                              preview_image_url: currentAvatar.image
                            })
                          });
                          if (response.ok) {
                            await response.json();
                            setSaveSuccessMessage('Avatar saved successfully!');
                            setAvatarNameInput('');
                            setTimeout(() => setSaveSuccessMessage(''), 3000);
                            // Reload saved avatars list
                            const listResponse = await fetch('/api/avatars', {
                              headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
                            });
                            if (listResponse.ok) {
                              const listData = await listResponse.json();
                              setSavedAvatars(listData.avatars || []);
                            }
                          }
                        } catch (error) {
                          console.error('Error saving avatar:', error);
                        }
                      }
                    }}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
                    disabled={!avatarNameInput.trim()}
                  >
                    <Save size={16} className="mr-2" />
                    {t('avatar.label.saveAvatar')}
                  </Button>
                  {saveSuccessMessage && (
                    <p className="text-sm text-green-400">{saveSuccessMessage}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500">{t('avatar.hint.selectAvatarFirst')}</p>
              )}
            </Card>

            {/* My Avatars Panel */}
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
                <User size={16} className="text-cyan-400" />
                {t('avatar.section.myAvatars').toUpperCase()}
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {isLoadingAvatars ? (
                  <p className="text-xs text-gray-500">Loading...</p>
                ) : savedAvatars.length > 0 ? (
                  savedAvatars.map((avatar) => (
                    <button
                      key={avatar.id}
                      onClick={() => {
                        setCurrentAvatar({
                          id: avatar.id,
                          image: avatar.preview_image_url,
                          prompt: avatar.title,
                          style: avatar.style,
                          createdAt: new Date(avatar.created_at),
                          isGenerating: false
                        });
                        // Set in global store for cross-service access
                        if (store.setAvatar) {
                          store.setAvatar({ 
                            id: avatar.id, 
                            name: avatar.title,
                            preview_url: avatar.preview_image_url,
                            model: avatar.style,
                            user_id: avatar.user_id
                          });
                        }
                      }}
                      className="w-full text-left p-2 rounded-lg border border-white/10 hover:border-purple-400 bg-black/20 transition-all group"
                    >
                      <div className="text-xs text-white font-medium truncate group-hover:text-purple-300">
                        {avatar.title}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">
                        {avatar.style} • {new Date(avatar.created_at).toLocaleDateString()}
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">{t('avatar.hint.noSavedAvatars')}</p>
                )}
              </div>
            </Card>

            {/* Talk Panel */}
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
                <Music size={16} className="text-pink-400" />
                {t('avatar.section.talk').toUpperCase()}
              </h3>
              <div className="space-y-3">
                <textarea
                  placeholder={t('avatar.hint.avatarSpeech')}
                  rows={4}
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:border-pink-500 focus:outline-none text-sm resize-none"
                />
                <Button
                  className="w-full bg-gradient-to-r from-pink-500 to-purple-500"
                  disabled>
                  <Loader2 size={16} className="mr-2" />
                  {t('avatar.label.generateSpeech')}
                </Button>
                <p className="text-[10px] text-gray-500">{t('avatar.hint.ttsComingSoon')}</p>
              </div>
            </Card>

            {/* Quick Tips */}
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">{t('avatar.section.tips').toUpperCase()}</h3>
              <div className="space-y-3 text-sm text-gray-400">
                <div className="flex items-start gap-2">
                  <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>{t('avatar.tips.1')}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>{t('avatar.tips.2')}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>{t('avatar.tips.3')}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>{t('avatar.tips.4')}</span>
                </div>
              </div>
            </Card>

            {/* Preset Manager */}
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">{t('avatar.section.presets').toUpperCase()}</h3>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t('avatar.label.filterCategory')}</label>
                    <select
                      value={presetCategoryFilter}
                      onChange={(e) => setPresetCategoryFilter(e.target.value)}
                      className="w-full px-2 py-2 bg-black/20 border border-white/10 rounded-lg text-xs text-white"
                    >
                      {['All', ...PRESET_CATEGORIES].map(item => (
                        <option key={item} value={item}>
                          {item === 'All' ? t('avatar.label.all') : (presetCategoryLabels[item] || item)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t('avatar.label.filterTag')}</label>
                    <select
                      value={presetTagFilter}
                      onChange={(e) => setPresetTagFilter(e.target.value)}
                      className="w-full px-2 py-2 bg-black/20 border border-white/10 rounded-lg text-xs text-white"
                    >
                      {['All', ...PRESET_TAGS].map(item => (
                        <option key={item} value={item}>
                          {item === 'All' ? t('avatar.label.all') : (presetTagLabels[item] || item)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/50"
                    placeholder={t('avatar.label.presetName')}
                  />
                  <Button
                    onClick={handleSavePreset}
                    className="bg-gradient-to-r from-purple-500 to-pink-500"
                  >
                    <Save size={16} className="mr-2" />
                    {t('avatar.label.save')}
                  </Button>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-2 block">{t('avatar.label.category')}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESET_CATEGORIES.map((item) => (
                      <button
                        key={item}
                        onClick={() => setPresetCategory(item)}
                        className={`px-2 py-1 rounded-lg border text-xs transition-all ${
                          presetCategory === item
                            ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                            : 'border-white/10 text-gray-400 hover:border-white/20'
                        }`}
                      >
                        {presetCategoryLabels[item] || item}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-2 block">{t('avatar.label.tags')}</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_TAGS.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => togglePresetTag(tag)}
                        className={`px-2 py-1 rounded-lg border text-xs transition-all ${
                          presetTags.includes(tag)
                            ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                            : 'border-white/10 text-gray-400 hover:border-white/20'
                        }`}
                      >
                        {presetTagLabels[tag] || tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleExportPresets}
                    className="border-white/10 flex-1"
                  >
                    <Download size={16} className="mr-2" />
                    {t('avatar.label.export')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => presetImportRef.current?.click()}
                    className="border-white/10 flex-1"
                  >
                    <Upload size={16} className="mr-2" />
                    {t('avatar.label.import')}
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
                  <p className="text-xs text-gray-500">{t('avatar.label.noPresets')}</p>
                ) : (
                  savedPresets
                    .filter(preset =>
                      presetCategoryFilter === 'All' || preset.category === presetCategoryFilter
                    )
                    .filter(preset =>
                      presetTagFilter === 'All' || (preset.tags || []).includes(presetTagFilter)
                    )
                    .map((preset) => (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg border border-white/10 bg-black/20"
                    >
                      <div className="flex-1">
                        <button
                          onClick={() => applyPreset(preset)}
                          className="text-left text-sm text-white hover:text-purple-300"
                        >
                          {preset.name}
                        </button>
                        <p className="text-[11px] text-gray-500">
                          {presetCategoryLabels[preset.category] || preset.category}
                        </p>
                        {preset.tags && preset.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {preset.tags.map(tag => (
                              <span key={tag} className="text-[10px] text-purple-200 border border-purple-500/20 rounded px-1">
                                {presetTagLabels[tag] || tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSharePreset(preset)}
                        className="h-7 w-7"
                      >
                        <Share2 size={12} />
                      </Button>
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
              <h3 className="text-sm font-semibold text-gray-400 mb-4">{t('avatar.section.stats').toUpperCase()}</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">{t('avatar.label.totalAvatars')}</span>
                  <span className="text-white font-semibold">{generatedAvatars.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">{t('avatar.label.thisMonth')}</span>
                  <span className="text-white font-semibold">{generatedAvatars.filter(a => {
                    const now = new Date();
                    return a.createdAt.getMonth() === now.getMonth() && 
                           a.createdAt.getFullYear() === now.getFullYear();
                  }).length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">{t('avatar.label.favoriteStyle')}</span>
                  <span className="text-white font-semibold capitalize">
                    {generatedAvatars.length > 0 
                      ? (AVATAR_STYLES.find(s => s.id === generatedAvatars[0].style)?.nameKey
                        ? t(AVATAR_STYLES.find(s => s.id === generatedAvatars[0].style)!.nameKey)
                        : generatedAvatars[0].style)
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
