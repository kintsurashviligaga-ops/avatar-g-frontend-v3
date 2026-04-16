'use client';

/**
 * AiHubShell
 *
 * The main production workspace — a full-screen, single-window AI studio
 * with collapsible sidebar → all 18 services → integrated panels.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │  TopBar  (logo · credits · search · locale)  │
 *   ├─────────┬────────────────────────────────────┤
 *   │Sidebar  │  Main Panel                        │
 *   │(280px)  │  (dynamic per selected service)    │
 *   └─────────┴────────────────────────────────────┘
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, UserCircle2, Video, Music2, Camera, ImageIcon, FileText,
  Wand2, Workflow, ShoppingCart, Cpu, Code2, Briefcase, Plane,
  Gamepad2, Sofa, Scissors, Eye, Film, ChevronLeft, ChevronRight,
  LayoutDashboard, Search, Zap, X, Menu, Coins, Settings, LogIn,
  TrendingUp, Sparkles, Plus, History, Star,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// ─── panel registry (lazy imports would be ideal in prod) ─────────────────────
import { DashboardPanel } from './panels/DashboardPanel';
import { AvatarPanel }    from './panels/AvatarPanel';
import { ImagePanel }     from './panels/ImagePanel';
import { VideoPanel }     from './panels/VideoPanel';
import { MusicPanel }     from './panels/MusicPanel';
import { CopyPanel }      from './panels/CopyPanel';
import { WorkflowPanel }  from './panels/WorkflowPanel';
import { AgentGPanel }    from './panels/AgentGPanel';
import { GenericPanel }   from './panels/GenericPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceSlug =
  | '__dashboard'
  | 'avatar' | 'video' | 'editing' | 'music' | 'photo' | 'image'
  | 'game' | 'interior' | 'media' | 'text' | 'prompt' | 'visual-intel'
  | 'workflow' | 'agent-g' | 'shop' | 'software' | 'business'
  | 'tourism' | 'next';

type SidebarItem = {
  id: ServiceSlug;
  label: string;
  icon: React.ElementType;
  accent: string;
  badge?: string;
  divider?: boolean;
};

type SidebarGroup = {
  title: string;
  items: SidebarItem[];
};

// ─── Sidebar config ───────────────────────────────────────────────────────────

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    title: '',
    items: [
      { id: '__dashboard', label: 'Dashboard',    icon: LayoutDashboard, accent: 'text-slate-300' },
      { id: 'agent-g',     label: 'Agent G',       icon: Bot,             accent: 'text-cyan-300', badge: 'AI' },
    ],
  },
  {
    title: 'Create',
    items: [
      { id: 'avatar',   label: 'Avatar Studio',  icon: UserCircle2, accent: 'text-violet-300' },
      { id: 'video',    label: 'Video Studio',   icon: Video,       accent: 'text-sky-300'    },
      { id: 'image',    label: 'Image Creator',  icon: ImageIcon,   accent: 'text-teal-300'   },
      { id: 'music',    label: 'Music Studio',   icon: Music2,      accent: 'text-pink-300'   },
      { id: 'photo',    label: 'Photo Studio',   icon: Camera,      accent: 'text-blue-300'   },
      { id: 'editing',  label: 'Video Editing',  icon: Scissors,    accent: 'text-orange-300' },
      { id: 'game',     label: 'Game Creator',   icon: Gamepad2,    accent: 'text-lime-300'   },
      { id: 'interior', label: 'Interior Design',icon: Sofa,        accent: 'text-amber-300'  },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { id: 'text',         label: 'Copy & Text',       icon: FileText, accent: 'text-green-300'  },
      { id: 'prompt',       label: 'Prompt Builder',    icon: Wand2,    accent: 'text-yellow-300' },
      { id: 'media',        label: 'Media Production',  icon: Film,     accent: 'text-red-300'    },
      { id: 'visual-intel', label: 'Visual Intel',      icon: Eye,      accent: 'text-indigo-300' },
    ],
  },
  {
    title: 'Automate',
    items: [
      { id: 'workflow', label: 'Workflow Builder', icon: Workflow, accent: 'text-orange-300', badge: 'New' },
    ],
  },
  {
    title: 'Business',
    items: [
      { id: 'shop',     label: 'Online Shop',     icon: ShoppingCart, accent: 'text-rose-300'   },
      { id: 'software', label: 'Software Dev',    icon: Code2,        accent: 'text-cyan-300'   },
      { id: 'business', label: 'Business Agent',  icon: Briefcase,    accent: 'text-amber-300'  },
      { id: 'tourism',  label: 'Tourism AI',      icon: Plane,        accent: 'text-sky-300'    },
      { id: 'next',     label: 'Expansion',       icon: Zap,          accent: 'text-slate-400'  },
    ],
  },
];

// ─── Panel router ─────────────────────────────────────────────────────────────

function renderPanel(active: ServiceSlug, locale: string) {
  switch (active) {
    case '__dashboard': return <DashboardPanel locale={locale} />;
    case 'agent-g':     return <AgentGPanel    locale={locale} />;
    case 'avatar':      return <AvatarPanel    locale={locale} />;
    case 'image':       return <ImagePanel     locale={locale} />;
    case 'video':       return <VideoPanel     locale={locale} />;
    case 'music':       return <MusicPanel     locale={locale} />;
    case 'text':        return <CopyPanel      locale={locale} />;
    case 'workflow':    return <WorkflowPanel  locale={locale} />;
    default:            return <GenericPanel   slug={active}   locale={locale} />;
  }
}

// ─── Sidebar Item ─────────────────────────────────────────────────────────────

function SbItem({
  item, active, collapsed, onClick,
}: { item: SidebarItem; active: boolean; collapsed: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 w-full rounded-xl transition-all duration-150',
        collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
        active
          ? 'bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
          : 'text-white/45 hover:text-white/80 hover:bg-white/[0.05]',
      )}
    >
      <Icon
        size={16}
        className={cn(
          'shrink-0 transition-colors',
          active ? item.accent : 'group-hover:' + item.accent,
        )}
      />
      {!collapsed && (
        <span className="text-[13px] font-medium truncate leading-none">{item.label}</span>
      )}
      {!collapsed && item.badge && (
        <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/20 leading-none">
          {item.badge}
        </span>
      )}
      {/* Active indicator */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-cyan-400" />
      )}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AiHubShellProps {
  locale: string;
  initialService?: ServiceSlug;
}

export function AiHubShell({ locale, initialService = '__dashboard' }: AiHubShellProps) {
  const [active, setActive]       = useState<ServiceSlug>(initialService);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQ, setSearchQ]     = useState('');

  const handleSelect = useCallback((id: ServiceSlug) => {
    setActive(id);
    setMobileOpen(false);
  }, []);

  const activeItem = SIDEBAR_GROUPS.flatMap(g => g.items).find(i => i.id === active);

  // ── Sidebar ──────────────────────────────────────────────────────
  const SidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo row */}
      <div className={cn('flex items-center shrink-0 mb-4', collapsed ? 'justify-center py-4' : 'gap-2.5 px-4 py-4')}>
        {!collapsed && (
          <>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shrink-0">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-none">MyAvatar</p>
              <p className="text-[10px] text-white/35 leading-none mt-0.5">.ge Studio</p>
            </div>
          </>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
            <Sparkles size={14} className="text-white" />
          </div>
        )}
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 mb-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/40">
            <Search size={13} />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search services..."
              className="bg-transparent text-[12px] text-white/70 placeholder:text-white/30 outline-none w-full min-w-0"
            />
            {searchQ && (
              <button onClick={() => setSearchQ('')}><X size={11} /></button>
            )}
          </div>
        </div>
      )}

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 scrollbar-thin scrollbar-thumb-white/10 space-y-0.5">
        {SIDEBAR_GROUPS.map((group) => {
          const filtered = searchQ
            ? group.items.filter(i => i.label.toLowerCase().includes(searchQ.toLowerCase()))
            : group.items;
          if (filtered.length === 0) return null;
          return (
            <div key={group.title} className="mb-1">
              {group.title && !collapsed && (
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                  {group.title}
                </p>
              )}
              {filtered.map(item => (
                <SbItem
                  key={item.id}
                  item={item}
                  active={active === item.id}
                  collapsed={collapsed}
                  onClick={() => handleSelect(item.id)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className={cn('shrink-0 border-t border-white/[0.06] pt-3 pb-3 space-y-1', collapsed ? 'px-1' : 'px-2')}>
        {!collapsed && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-400/[0.06] border border-cyan-400/20">
            <Coins size={13} className="text-cyan-300 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-cyan-200 leading-none">Credits</p>
              <p className="text-[10px] text-white/40 mt-0.5">—</p>
            </div>
            <TrendingUp size={11} className="text-cyan-400 shrink-0" />
          </div>
        )}
        <Link
          href={`/${locale}/settings`}
          className={cn(
            'flex items-center gap-2 rounded-xl py-2 text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors',
            collapsed ? 'justify-center px-0' : 'px-3',
          )}
        >
          <Settings size={15} />
          {!collapsed && <span className="text-[12px]">Settings</span>}
        </Link>
        <Link
          href={`/${locale}/login`}
          className={cn(
            'flex items-center gap-2 rounded-xl py-2 text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors',
            collapsed ? 'justify-center px-0' : 'px-3',
          )}
        >
          <LogIn size={15} />
          {!collapsed && <span className="text-[12px]">Sign In</span>}
        </Link>
      </div>
    </div>
  );

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--color-bg, #050514)' }}
    >
      {/* ── Desktop Sidebar ───────────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 260 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        className="hidden lg:flex flex-col shrink-0 relative border-r border-white/[0.06]"
        style={{ background: 'rgba(5,5,20,0.98)' }}
      >
        {SidebarContent}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="absolute top-5 -right-3 z-10 w-6 h-6 rounded-full border border-white/[0.12] bg-[#0a0a20] flex items-center justify-center text-white/40 hover:text-white/70 transition-colors shadow-lg"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </motion.aside>

      {/* ── Mobile Sidebar Overlay ────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              key="drawer"
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden flex flex-col border-r border-white/[0.06]"
              style={{ background: '#05050e' }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-3 text-white/40 hover:text-white/70"
              >
                <X size={18} />
              </button>
              {SidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Right column ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header
          className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-5 h-14 border-b border-white/[0.06]"
          style={{ background: 'rgba(5,5,20,0.92)', backdropFilter: 'blur(12px)' }}
        >
          <div className="flex items-center gap-2">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-white/50 hover:text-white p-1"
            >
              <Menu size={20} />
            </button>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-white/30">Studio</span>
              <ChevronRight size={11} className="text-white/20" />
              <span className="text-[13px] font-semibold text-white">
                {activeItem?.label ?? 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* New session */}
            <button className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-200 text-[12px] font-semibold hover:bg-cyan-400/[0.12] transition-colors">
              <Plus size={13} />
              New
            </button>
            {/* History */}
            <Link
              href={`/${locale}/studio/history`}
              className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
            >
              <History size={16} />
            </Link>
            {/* Credits mini badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/60 text-[12px]">
              <Coins size={13} className="text-amber-400" />
              <span className="font-medium">—</span>
            </div>
          </div>
        </header>

        {/* Main panel */}
        <main className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              {renderPanel(active, locale)}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
