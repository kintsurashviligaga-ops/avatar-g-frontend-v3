"use client";

import { useLanguage } from "./LanguageProvider";

export default function ServiceContent() {
  const { language } = useLanguage();

  return (
    <div className="space-y-6">
      {/* Project Setup */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-cyan-400">
          {language === "ka" ? "პროექტის კონფიგურაცია" : "Project Setup"}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white/5 border border-cyan-500/10 rounded-lg p-4">
            <p className="text-sm font-medium text-slate-300 mb-2">
              {language === "ka" ? "პროექტის სახელი" : "Project Name"}
            </p>
            <input
              type="text"
              placeholder={
                language === "ka" ? "შეიყვანეთ სახელი" : "Enter name"
              }
              className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div className="bg-white/5 border border-cyan-500/10 rounded-lg p-4">
            <p className="text-sm font-medium text-slate-300 mb-2">
              {language === "ka" ? "ხარისხის დონე" : "Quality Level"}
            </p>
            <select className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
              <option value="standard">
                {language === "ka" ? "სტანდარტი" : "Standard"}
              </option>
              <option value="premium">
                {language === "ka" ? "პრემიუმი" : "Premium"}
              </option>
              <option value="ultra">
                {language === "ka" ? "ულტრა" : "Ultra"}
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Parameters */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-cyan-400">
          {language === "ka" ? "პარამეტრები" : "Parameters"}
        </h3>
        <div className="bg-white/5 border border-cyan-500/10 rounded-lg p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">
              {language === "ka" ? "სტილი" : "Style"}
            </label>
            <div className="flex flex-wrap gap-2">
              {["Modern", "Classic", "Creative"].map((style) => (
                <button
                  key={style}
                  className="px-4 py-2 bg-white/5 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/40 rounded-lg text-sm transition-colors"
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">
              {language === "ka" ? "დეტალები" : "Details"}
            </label>
            <textarea
              rows={3}
              placeholder={
                language === "ka"
                  ? "აღწერეთ თქვენი მოთხოვნა..."
                  : "Describe your requirements..."
              }
              className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
        </div>
      </div>

      {/* Info Note */}
      <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4">
        <p className="text-sm text-cyan-300">
          {language === "ka"
            ? "სრული ფუნქციონალი მალე დაემატება. ამჟამად ტესტირების რეჟიმში ვართ."
            : "Full functionality coming soon. Currently in testing mode."}
        </p>
      </div>
    </div>
  );
}
