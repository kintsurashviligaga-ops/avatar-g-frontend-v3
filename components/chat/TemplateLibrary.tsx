"use client";

import { useState } from "react";
import { Search, Sparkles, Tag } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { ChatTemplate, ServiceId } from "@/lib/types/runtime";

interface TemplateLibraryProps {
  serviceId: ServiceId;
  templates: ChatTemplate[];
  onUseTemplate: (template: ChatTemplate) => void;
}

export default function TemplateLibrary({
  serviceId,
  templates,
  onUseTemplate,
}: TemplateLibraryProps) {
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(true);

  const filteredTemplates = templates.filter(
    (t) =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm flex items-center justify-center gap-2"
      >
        <Sparkles className="w-4 h-4" />
        {language === "ka" ? "შაბლონები" : "Templates"}
      </button>
    );
  }

  return (
    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-4 backdrop-blur-xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          {language === "ka" ? "შაბლონები" : "Templates"}
        </h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-300"
        >
          {language === "ka" ? "დამალვა" : "Hide"}
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={language === "ka" ? "ძიება..." : "Search..."}
          className="w-full pl-9 pr-3 py-2 bg-white/5 border border-cyan-500/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
        />
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredTemplates.map((template) => (
          <button
            key={template.id}
            onClick={() => onUseTemplate(template)}
            className="w-full text-left p-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="text-sm font-medium">{template.title}</h4>
            </div>
            <p className="text-xs text-slate-400 mb-2">{template.desc}</p>
            <div className="flex flex-wrap gap-1">
              {template.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/20 rounded text-xs text-cyan-400"
                >
                  <Tag className="w-3 h-3" />
                  {tag}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <p className="text-center text-sm text-slate-500 py-4">
          {language === "ka" ? "შაბლონები ვერ მოიძებნა" : "No templates found"}
        </p>
      )}
    </div>
  );
}
