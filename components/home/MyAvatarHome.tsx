'use client';

/**
 * MyAvatarHome — the new mobile-first home dashboard that matches the
 * "Your Digital Self. Always With You." design.
 *
 * Replaces the previous Agent G welcome surface on /[locale]/dashboard.
 * The full chat experience (CommandCenter / ChatInterface) lives at
 * /[locale]/chat and is reached via the "Chat With My Avatar" CTA.
 *
 * All backend functionality (Voice Lab, Memory, Analytics, generation
 * APIs, InlineMedia previews) is preserved — this is purely a new home
 * surface that links into the existing pages.
 */

import Link from 'next/link';
import Image from 'next/image';
import { Rocket, Bell, UserCircle2, Mic2, Brain, BarChart3, Home, User, MessageSquare, Plus } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface Conversation {
  id: string;
  title: string;
  last_message_at: string;
  last_message_snippet: string | null;
}

interface Avatar {
  id: string;
  name: string | null;
  personality: string | null;
  voice_id: string | null;
  image_url: string | null;
}

interface MyAvatarHomeProps {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
  avatar: Avatar | null;
  recentConversations: Conversation[];
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar() {
  return (
    <header className="flex items-center justify-between px-5 pt-5 pb-3">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Rocket size={20} className="text-violet-300" strokeWidth={2.2} />
          <span className="absolute inset-0 blur-md bg-violet-500/40 -z-10" />
        </div>
        <span className="text-base font-semibold text-white tracking-tight">MyAvatar</span>
      </div>
      <button
        type="button"
        aria-label="Notifications"
        className="relative h-9 w-9 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition"
      >
        <Bell size={16} className="text-white/70" />
      </button>
    </header>
  );
}

// ─── Hero card (avatar + status + Chat CTA) ───────────────────────────────────

function HeroCard({ locale, avatar }: { locale: string; avatar: Avatar | null }) {
  const personalityText = avatar?.personality
    ? avatar.personality.charAt(0).toUpperCase() + avatar.personality.slice(1)
    : 'Friendly, Smart, Funny';
  const voiceText = avatar?.voice_id ? 'Cloned' : 'Default';
  const name = avatar?.name ? `${avatar.name}'s Avatar` : 'Your Avatar';
  const isReady = !!avatar?.name;

  return (
    <section className="mx-4 mb-4 rounded-3xl bg-zinc-900/70 backdrop-blur border border-white/8 p-5">
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 -m-1 rounded-full bg-gradient-to-br from-violet-500/50 to-cyan-400/40 blur-md" />
          <div className="relative h-20 w-20 rounded-full overflow-hidden border-2 border-violet-500/60 bg-zinc-800">
            {avatar?.image_url ? (
              <Image src={avatar.image_url} alt="" fill sizes="80px" className="object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-3xl">
                <UserCircle2 className="text-violet-300/70" size={56} />
              </div>
            )}
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/40">
            Online
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-white tracking-tight">{name}</h2>
          <p className="text-[11px] font-medium text-emerald-400 mt-0.5">
            {isReady ? 'Trained & Ready' : 'Setup needed'}
          </p>
          <dl className="mt-2 space-y-1">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[11px] text-white/40">Personality:</dt>
              <dd className="text-[11px] text-white/80 truncate">{personalityText}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[11px] text-white/40">Voice:</dt>
              <dd className="text-[11px] text-white/80">{voiceText}</dd>
            </div>
          </dl>
        </div>
      </div>

      <Link
        href={`/${locale}/chat`}
        className="mt-4 w-full inline-flex items-center justify-between rounded-2xl px-5 py-3.5 text-[14px] font-semibold text-white bg-gradient-to-r from-violet-600 to-violet-500 shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition active:scale-[0.98]"
      >
        <span>Chat With My Avatar</span>
        <MessageSquare size={16} />
      </Link>
    </section>
  );
}

// ─── Quick Actions (Edit Avatar / Voice Lab / Memory / Analytics) ─────────────

function QuickActions({ locale }: { locale: string }) {
  const items = [
    { href: `/${locale}/avatar`,    label: 'Edit Avatar', icon: User,      accent: 'from-violet-500/30 to-violet-700/10', iconColor: 'text-violet-300' },
    { href: `/${locale}/voice-lab`, label: 'Voice Lab',   icon: Mic2,      accent: 'from-cyan-500/30 to-cyan-700/10',    iconColor: 'text-cyan-300' },
    { href: `/${locale}/memory`,    label: 'Memory',      icon: Brain,     accent: 'from-emerald-500/30 to-emerald-700/10', iconColor: 'text-emerald-300' },
    { href: `/${locale}/analytics`, label: 'Analytics',   icon: BarChart3, accent: 'from-amber-500/30 to-amber-700/10',  iconColor: 'text-amber-300' },
  ] as const;

  return (
    <section className="mx-4 mb-4 rounded-3xl bg-zinc-900/70 backdrop-blur border border-white/8 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-white tracking-tight">Quick Actions</h3>
        <Link href={`/${locale}/services`} className="text-[11px] font-medium text-violet-300 hover:text-violet-200">
          See All
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {items.map(({ href, label, icon: Icon, accent, iconColor }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-zinc-800/60 hover:bg-zinc-800 border border-white/6 transition active:scale-[0.96]"
          >
            <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center`}>
              <Icon size={16} className={iconColor} strokeWidth={2.2} />
            </div>
            <span className="text-[10px] font-medium text-white/80 leading-tight text-center">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Recent Conversations ─────────────────────────────────────────────────────

function RecentConversations({ locale, conversations }: { locale: string; conversations: Conversation[] }) {
  return (
    <section className="mx-4 mb-4 rounded-3xl bg-zinc-900/70 backdrop-blur border border-white/8 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-white tracking-tight">Recent Conversations</h3>
        <Link href={`/${locale}/chat`} className="text-[11px] font-medium text-violet-300 hover:text-violet-200">
          See All
        </Link>
      </div>

      {conversations.length === 0 ? (
        <Link
          href={`/${locale}/chat`}
          className="block py-6 text-center rounded-2xl border border-dashed border-white/10 hover:border-white/20 transition"
        >
          <p className="text-[13px] text-white/50">No conversations yet</p>
          <p className="text-[11px] text-violet-300 mt-1">Start chatting →</p>
        </Link>
      ) : (
        <ul className="space-y-2">
          {conversations.slice(0, 3).map(c => (
            <li key={c.id}>
              <Link
                href={`/${locale}/chat?cid=${c.id}`}
                className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-800/50 hover:bg-zinc-800 border border-white/4 transition"
              >
                <div className="flex-shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-violet-500/40 to-cyan-500/30 flex items-center justify-center">
                  <MessageSquare size={14} className="text-white/80" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-white truncate">{c.title || 'Conversation'}</span>
                    <span className="text-[10px] text-white/40 flex-shrink-0">{relativeTime(c.last_message_at)}</span>
                  </div>
                  {c.last_message_snippet && (
                    <p className="text-[11px] text-white/50 line-clamp-1 mt-0.5">{c.last_message_snippet}</p>
                  )}
                </div>
                <div className="flex-shrink-0 h-2 w-2 rounded-full bg-emerald-400 mt-2" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

function HowItWorks({ locale }: { locale: string }) {
  const steps = [
    { n: 1, title: 'Create your Avatar', body: 'Pick a name, personality, and voice in under a minute.', href: `/${locale}/onboarding` },
    { n: 2, title: 'Train with content', body: 'Upload chat memories or clone your voice for higher fidelity.', href: `/${locale}/voice-lab` },
    { n: 3, title: 'Chat & generate', body: 'Talk, generate images, videos, music — all inline.', href: `/${locale}/chat` },
  ] as const;

  return (
    <section className="mx-4 mb-4 rounded-3xl bg-zinc-900/70 backdrop-blur border border-white/8 p-5">
      <p className="text-[10px] font-bold tracking-[0.18em] text-white/40 uppercase mb-1">How it works</p>
      <h3 className="text-[18px] font-bold text-white tracking-tight mb-4">3 Simple Steps</h3>
      <ol className="space-y-2">
        {steps.map(s => (
          <li key={s.n}>
            <Link
              href={s.href}
              className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-800/50 hover:bg-zinc-800 border border-white/4 transition"
            >
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center text-[12px] font-bold text-white">
                {s.n}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-white">{s.title}</div>
                <p className="text-[11px] text-white/55 mt-0.5">{s.body}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── Bottom Nav (mobile fixed, desktop sticky) ────────────────────────────────

export function BottomNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const items = [
    { href: `/${locale}/dashboard`, label: 'Home',      icon: Home },
    { href: `/${locale}/avatar`,    label: 'My Avatar', icon: User },
    { href: `/${locale}/chat`,      label: 'Chat',      icon: MessageSquare, center: false },
    { href: `/${locale}/account`,   label: 'Profile',   icon: UserCircle2 },
  ] as const;
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-white/8 bg-zinc-950/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom,0px)]"
      role="navigation"
      aria-label="Primary"
    >
      <div className="max-w-md mx-auto flex items-center justify-around px-4 pt-2 pb-2 relative">
        {/* Left two */}
        {items.slice(0, 2).map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[56px]"
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} className={active ? 'text-violet-300' : 'text-white/45'} strokeWidth={active ? 2.4 : 2} />
              <span className={`text-[10px] font-medium ${active ? 'text-violet-300' : 'text-white/45'}`}>
                {label}
              </span>
            </Link>
          );
        })}

        {/* Centered + button (new conversation) */}
        <Link
          href={`/${locale}/chat?new=1`}
          className="-mt-6 h-14 w-14 rounded-full bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center shadow-xl shadow-violet-500/40 border-4 border-zinc-950 hover:from-violet-500 hover:to-violet-400 transition active:scale-95"
          aria-label="New conversation"
        >
          <Plus size={22} className="text-white" strokeWidth={2.4} />
        </Link>

        {/* Right two */}
        {items.slice(2).map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[56px]"
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} className={active ? 'text-violet-300' : 'text-white/45'} strokeWidth={active ? 2.4 : 2} />
              <span className={`text-[10px] font-medium ${active ? 'text-violet-300' : 'text-white/45'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Main composite ───────────────────────────────────────────────────────────

export default function MyAvatarHome({
  locale,
  userName: _userName,
  isAuthenticated: _isAuthenticated,
  avatar,
  recentConversations,
}: MyAvatarHomeProps) {
  return (
    <main
      className="min-h-screen bg-zinc-950 text-white pb-32"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(139,92,246,0.18) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 0% 30%, rgba(34,211,238,0.08) 0%, transparent 60%)',
      }}
    >
      <div className="max-w-md mx-auto">
        <TopBar />
        <HeroCard locale={locale} avatar={avatar} />
        <QuickActions locale={locale} />
        <RecentConversations locale={locale} conversations={recentConversations} />
        <HowItWorks locale={locale} />
      </div>
      <BottomNav locale={locale} />
    </main>
  );
}
