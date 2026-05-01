'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Search, Trash2, MessageSquare, X } from 'lucide-react';
import type { Conversation } from '@/lib/chat-history';

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  open: boolean;
  onClose: () => void;
}

function groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const groups: Record<string, Conversation[]> = {
    დღეს: [],
    გუშინ: [],
    ძველი: [],
  };

  for (const conv of conversations) {
    const d = new Date(conv.updated_at);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day.getTime() === today.getTime()) {
      groups['დღეს']!.push(conv);
    } else if (day.getTime() === yesterday.getTime()) {
      groups['გუშინ']!.push(conv);
    } else {
      groups['ძველი']!.push(conv);
    }
  }

  return groups;
}

export default function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  open,
  onClose,
}: ChatSidebarProps) {
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations;
    const q = query.toLowerCase();
    return conversations.filter((c) =>
      (c.title ?? '').toLowerCase().includes(q)
    );
  }, [conversations, query]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    onDelete(id);
    setDeletingId(null);
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-50 w-[280px]
          flex flex-col
          bg-[#070d1e]/95 backdrop-blur-xl
          border-r border-white/10
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:translate-x-0 lg:z-auto lg:flex
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center">
              <span className="text-cyan-400 text-[10px] font-bold">G</span>
            </div>
            <span className="text-white/70 text-sm font-medium">Agent G</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-white/40 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New chat button */}
        <div className="px-3 mb-3">
          <button
            onClick={onNew}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-400/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            ახალი ჩატი
          </button>
        </div>

        {/* Search */}
        <div className="px-3 mb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder="ძებნა..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-white/70 placeholder-white/30 text-sm outline-none focus:border-cyan-400/30 focus:bg-white/[0.06] transition-colors"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 space-y-4 pb-4">
          {Object.entries(grouped).map(([label, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={label}>
                <p className="text-white/30 text-[10px] uppercase tracking-wider px-2 mb-1.5">
                  {label}
                </p>
                <div className="space-y-0.5">
                  {items.map((conv) => (
                    <div
                      key={conv.session_id}
                      onClick={() => onSelect(conv.session_id)}
                      className={`
                        group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors
                        ${activeId === conv.session_id
                          ? 'bg-cyan-500/10 border border-cyan-400/20'
                          : 'hover:bg-white/[0.04] border border-transparent'
                        }
                      `}
                    >
                      <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${activeId === conv.session_id ? 'text-cyan-400' : 'text-white/30'}`} />
                      <span className={`flex-1 text-sm truncate ${activeId === conv.session_id ? 'text-white/90' : 'text-white/60'}`}>
                        {conv.title ?? 'ახალი ჩატი'}
                      </span>
                      <button
                        onClick={(e) => handleDelete(e, conv.session_id)}
                        disabled={deletingId === conv.session_id}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-white/30 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-8 text-white/30 text-sm">
              {query ? 'ვერ მოიძებნა' : 'ისტორია ცარიელია'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <p className="text-white/20 text-[10px] text-center">Agent G · Claude Opus</p>
        </div>
      </aside>
    </>
  );
}
