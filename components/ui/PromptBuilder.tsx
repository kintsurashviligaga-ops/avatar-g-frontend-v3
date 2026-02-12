"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Save, RotateCw, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { Button } from "./button";
import { Card } from "./card";

export type ServiceType = "music" | "video" | "avatar" | "voice";

interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  template: string;
  variables: string[];
  tags: string[];
  isFavorite: boolean;
}

interface PromptField {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "textarea" | "select" | "number";
  options?: string[];
  required: boolean;
}

// Pre-defined templates for each service
const templateLibrary: Record<ServiceType, PromptTemplate[]> = {
  music: [
    {
      id: "pop-song",
      name: "Pop Song Generator",
      category: "Genre",
      template: "Create a [MOOD] pop song about [TOPIC]. Artist style: [ARTIST_STYLE]. BPM: [BPM]. Duration: [DURATION]",
      variables: ["MOOD", "TOPIC", "ARTIST_STYLE", "BPM", "DURATION"],
      tags: ["pop", "upbeat", "commercial"],
      isFavorite: false,
    },
    {
      id: "ambient-music",
      name: "Ambient Music Creator",
      category: "Genre",
      template: "Generate [MOOD] ambient music for [PURPOSE]. Instruments: [INSTRUMENTS]. Duration: [DURATION] minutes. Intensity: [INTENSITY]",
      variables: ["MOOD", "PURPOSE", "INSTRUMENTS", "DURATION", "INTENSITY"],
      tags: ["ambient", "relaxing", "background"],
      isFavorite: false,
    },
    {
      id: "song-lyrics",
      name: "Song Lyrics Template",
      category: "Creative",
      template: "Write song lyrics with [THEME]. Genre: [GENRE]. Mood: [MOOD]. Structure: [STRUCTURE] (verse-chorus-bridge). Include [SPECIAL_ELEMENT]",
      variables: ["THEME", "GENRE", "MOOD", "STRUCTURE", "SPECIAL_ELEMENT"],
      tags: ["lyrics", "creative", "structure"],
      isFavorite: false,
    },
  ],
  video: [
    {
      id: "cinematic-scene",
      name: "Cinematic Scene",
      category: "Style",
      template: "Generate a [STYLE] video scene: [DESCRIPTION]. Duration: [DURATION]s. Camera movement: [CAMERA_MOVE]. Music vibe: [MUSIC_VIBE]",
      variables: ["STYLE", "DESCRIPTION", "DURATION", "CAMERA_MOVE", "MUSIC_VIBE"],
      tags: ["cinematic", "professional", "visual"],
      isFavorite: false,
    },
    {
      id: "product-showcase",
      name: "Product Showcase",
      category: "Commercial",
      template: "Create a product video for [PRODUCT]. Key features: [FEATURES]. Target audience: [AUDIENCE]. Style: [STYLE]. Duration: [DURATION]s",
      variables: ["PRODUCT", "FEATURES", "AUDIENCE", "STYLE", "DURATION"],
      tags: ["commercial", "product", "marketing"],
      isFavorite: false,
    },
    {
      id: "storytelling",
      name: "Story Video Generator",
      category: "Creative",
      template: "Produce a story video about [STORY]. Tone: [TONE]. Visual style: [VISUAL_STYLE]. Characters: [CHARACTERS]. Setting: [SETTING]",
      variables: ["STORY", "TONE", "VISUAL_STYLE", "CHARACTERS", "SETTING"],
      tags: ["storytelling", "narrative", "creative"],
      isFavorite: false,
    },
  ],
  avatar: [
    {
      id: "realistic-avatar",
      name: "Realistic Character",
      category: "Style",
      template: "Create a realistic avatar with [ETHNICITY] features. Age: [AGE]. Expression: [EXPRESSION]. Clothing: [CLOTHING]. Hair: [HAIR_STYLE]. Mood: [MOOD]",
      variables: ["ETHNICITY", "AGE", "EXPRESSION", "CLOTHING", "HAIR_STYLE", "MOOD"],
      tags: ["realistic", "human", "professional"],
      isFavorite: false,
    },
    {
      id: "anime-avatar",
      name: "Anime Character",
      category: "Style",
      template: "Design anime avatar. Style: [ANIME_STYLE]. Hair color: [HAIR_COLOR]. Eyes: [EYE_TYPE]. Outfit: [OUTFIT]. Personality: [PERSONALITY]",
      variables: ["ANIME_STYLE", "HAIR_COLOR", "EYE_TYPE", "OUTFIT", "PERSONALITY"],
      tags: ["anime", "cartoon", "stylized"],
      isFavorite: false,
    },
    {
      id: "metaverse-avatar",
      name: "Metaverse Avatar",
      category: "Digital",
      template: "Create metaverse-ready avatar. Theme: [THEME]. Technology level: [TECH_LEVEL]. Accessories: [ACCESSORIES]. Environment: [ENVIRONMENT]",
      variables: ["THEME", "TECH_LEVEL", "ACCESSORIES", "ENVIRONMENT"],
      tags: ["metaverse", "vr", "futuristic"],
      isFavorite: false,
    },
  ],
  voice: [
    {
      id: "narration",
      name: "Professional Narration",
      category: "Type",
      template: "Generate narration for [CONTENT_TYPE]. Language: [LANGUAGE]. Voice gender: [GENDER]. Tone: [TONE]. Pace: [PACE]. Emotion: [EMOTION]",
      variables: ["CONTENT_TYPE", "LANGUAGE", "GENDER", "TONE", "PACE", "EMOTION"],
      tags: ["narration", "professional", "audio"],
      isFavorite: false,
    },
    {
      id: "character-voice",
      name: "Character Voice",
      category: "Creative",
      template: "Create character voice for [CHARACTER_NAME]. Personality: [PERSONALITY]. Age: [AGE_RANGE]. Accent: [ACCENT]. Speaking style: [STYLE]. Mood: [MOOD]",
      variables: ["CHARACTER_NAME", "PERSONALITY", "AGE_RANGE", "ACCENT", "STYLE", "MOOD"],
      tags: ["character", "creative", "personality"],
      isFavorite: false,
    },
    {
      id: "tts-style",
      name: "Text-to-Speech Style",
      category: "TTS",
      template: "Convert text with [VOICE_TYPE] voice. Accent: [ACCENT]. Speed: [SPEED]. Pitch: [PITCH]. Emotion: [EMOTION]. Language: [LANGUAGE]",
      variables: ["VOICE_TYPE", "ACCENT", "SPEED", "PITCH", "EMOTION", "LANGUAGE"],
      tags: ["tts", "text-to-speech", "automation"],
      isFavorite: false,
    },
  ],
};

interface PromptBuilderProps {
  serviceType: ServiceType;
  onApplyPrompt?: (prompt: string) => void;
  onSavePrompt?: (prompt: PromptTemplate) => void;
}

export function PromptBuilder({
  serviceType,
  onApplyPrompt,
  onSavePrompt,
}: PromptBuilderProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);

  const templates = templateLibrary[serviceType];

  // Generate prompt from template
  const generatePrompt = useCallback(() => {
    if (!selectedTemplate) return;

    let result = selectedTemplate.template;
    selectedTemplate.variables.forEach((variable) => {
      const value = variables[variable] || `[${variable}]`;
      result = result.replace(`[${variable}]`, value);
    });

    setGeneratedPrompt(result);
  }, [selectedTemplate, variables]);

  // Handle template selection
  const handleSelectTemplate = (template: PromptTemplate) => {
    setSelectedTemplate(template);
    setVariables({});
    setGeneratedPrompt("");
  };

  // Copy to clipboard
  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(generatedPrompt);
  }, [generatedPrompt]);

  // Apply/Send prompt
  const handleApplyPrompt = useCallback(() => {
    if (generatedPrompt && onApplyPrompt) {
      onApplyPrompt(generatedPrompt);
    }
  }, [generatedPrompt, onApplyPrompt]);

  // Save custom prompt template
  const handleSaveTemplate = useCallback(() => {
    if (generatedPrompt && onSavePrompt) {
      const customTemplate: PromptTemplate = {
        id: `custom_${Date.now()}`,
        name: `Custom ${selectedTemplate?.name || "Prompt"}`,
        category: selectedTemplate?.category || "Custom",
        template: generatedPrompt,
        variables: Object.keys(variables),
        tags: [...(selectedTemplate?.tags || []), "custom"],
        isFavorite: false,
      };
      onSavePrompt(customTemplate);
    }
  }, [generatedPrompt, selectedTemplate, variables, onSavePrompt]);

  // Toggle favorite
  const toggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((fav) => fav !== id) : [...prev, id]
    );
  };

  return (
    <Card className="bg-gradient-to-b from-slate-800 to-slate-900 border-cyan-500/20 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-cyan-100">{serviceType.charAt(0).toUpperCase() + serviceType.slice(1)} Prompt Builder</h3>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-400 hover:text-cyan-400 transition-colors"
        >
          {isExpanded ? <ChevronUp /> : <ChevronDown />}
        </button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4"
          >
            {/* Template selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Available Templates</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className={`p-3 rounded-lg text-left border transition-all ${
                      selectedTemplate?.id === template.id
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-gray-700 bg-gray-800/30 hover:border-cyan-400/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-sm font-medium text-cyan-100">{template.name}</div>
                        <div className="text-xs text-gray-400">{template.category}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(template.id);
                        }}
                        className={`text-lg ${
                          favorites.includes(template.id)
                            ? "text-yellow-400"
                            : "text-gray-500"
                        }`}
                      >
                        ★
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {template.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded bg-gray-700/50 text-gray-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Variables input */}
            {selectedTemplate && selectedTemplate.variables.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Customize Variables</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedTemplate.variables.map((variable) => (
                    <input
                      key={variable}
                      type="text"
                      placeholder={`${variable.toLowerCase().replace(/_/g, " ")}`}
                      value={variables[variable] || ""}
                      onChange={(e) =>
                        setVariables((prev) => ({
                          ...prev,
                          [variable]: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 bg-gray-800 text-white placeholder-gray-500 rounded-lg border border-gray-700 focus:border-cyan-500/50 text-sm outline-none transition-colors"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            {selectedTemplate && (
              <div className="flex gap-2">
                <Button
                  onClick={generatePrompt}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white"
                >
                  Generate Prompt
                </Button>
                <button
                  onClick={() => {
                    setSelectedTemplate(null);
                    setVariables({});
                    setGeneratedPrompt("");
                  }}
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Reset"
                >
                  <RotateCw className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            )}

            {/* Generated prompt display */}
            {generatedPrompt && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30"
              >
                <label className="block text-sm font-medium text-cyan-200 mb-2">Generated Prompt</label>
                <div className="text-sm text-gray-200 leading-relaxed mb-3 max-h-32 overflow-y-auto">
                  {generatedPrompt}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleCopyPrompt}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm"
                    size="sm"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                  <Button
                    onClick={handleApplyPrompt}
                    className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm"
                    size="sm"
                  >
                    <Zap className="w-4 h-4 mr-1" />
                    Apply
                  </Button>
                  {onSavePrompt && (
                    <Button
                      onClick={handleSaveTemplate}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm"
                      size="sm"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Save
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
