"use client";

import { useState } from "react";
import { Save, Upload, Trash2, Star } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { Preset, ServiceId } from "@/lib/types/runtime";
import { loadPresets, addPreset, savePresets } from "@/lib/runtime/storage";

interface PresetsLibraryProps {
  serviceId: ServiceId;
  currentParams: Record<string, any>;
  onApplyPreset: (params: Record<string, any>) => void;
  defaultPresets: Preset[];
}

export default function PresetsLibrary({
  serviceId,
  currentParams,
  onApplyPreset,
  defaultPresets,
}: PresetsLibraryProps) {
  const { language } = useLanguage();
  const [userPresets, setUserPresets] = useState<Preset[]>(() => loadPresets(serviceId));
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [presetName, setPresetName] = useState("");

  const handleSave = () => {
    if (!presetName.trim()) return;

    const preset: Preset = {
      id: "preset_" + Date.now(),
      name: presetName.trim(),
      serviceId,
      params: currentParams,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addPreset(serviceId, preset);
    setUserPresets(loadPresets(serviceId));
    setPresetName("");
    setShowSaveModal(false);
  };

  const handleDelete = (id: string) => {
    const updated = userPresets.filter((p) => p.id !== id);
    savePresets(serviceId, updated);
    setUserPresets(updated);
  };

  return (
    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-cyan-400">
          {language === "ka" ? "პრესეტები" : "Presets"}
        </h3>
        <button
          onClick={() => setShowSaveModal(true)}
          className="flex items-center gap-2 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-xs transition-colors"
        >
          <Save className="w-3 h-3" />
          {language === "ka" ? "შენახვა" : "Save"}
        </button>
      </div>

      {/* Default Presets */}
      <div>
        <p className="text-xs text-slate-400 mb-2">
          {language === "ka" ? "ნაგულისხმევი" : "Default"}
        </p>
        <div className="space-y-2">
          {defaultPresets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onApplyPreset(preset.params)}
              className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-left transition-colors"
            >
              <Star className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span className="text-sm">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* User Presets */}
      {userPresets.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-2">
            {language === "ka" ? "ჩემი პრესეტები" : "My Presets"}
          </p>
          <div className="space-y-2">
            {userPresets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center gap-2 p-3 bg-white/5 border border-cyan-500/20 rounded-lg"
              >
                <button
                  onClick={() => onApplyPreset(preset.params)}
                  className="flex-1 flex items-center gap-3 text-left"
                >
                  <Upload className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-sm">{preset.name}</span>
                </button>
                <button
                  onClick={() => handleDelete(preset.id)}
                  className="p-1 hover:bg-red-500/20 rounded text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#05070A] border border-cyan-500/20 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">
              {language === "ka" ? "პრესეტის შენახვა" : "Save Preset"}
            </h3>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={language === "ka" ? "პრესეტის სახელი..." : "Preset name..."}
              className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm"
              >
                {language === "ka" ? "გაუქმება" : "Cancel"}
              </button>
              <button
                onClick={handleSave}
                disabled={!presetName.trim()}
                className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm"
              >
                {language === "ka" ? "შენახვა" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
