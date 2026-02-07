import React from 'react';

interface Props {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  children: React.ReactNode;
}

export function ServicePageShell({ title, description, icon, gradient, children }: Props) {
  return (
    <div className="min-h-screen bg-[#0A0F1C] text-white">
      <header className="px-4 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            {icon}
          </div>
          <div>
            <h1 className="font-bold text-lg">{title}</h1>
            <p className="text-xs text-gray-400">{description}</p>
          </div>
        </div>
        <div className="flex gap-4">
          <a href="/services" className="text-sm text-gray-400 hover:text-white transition-colors">Services</a>
          <a href="/" className="text-sm text-gray-400 hover:text-white transition-colors">Home</a>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}