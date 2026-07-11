'use client';

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, ChevronRight, ChevronLeft,
  MessageSquare, Crown,
  Zap, Folder, BookOpen, Settings, Key,
  HelpCircle, Sparkles, LogOut,
  Eye, EyeOff, Copy, Check,
  User, ShieldCheck, Activity,
} from 'lucide-react';
import { ProviderStatusList } from './ProviderStatusList';
import { OMNI_SERVICES } from './services';
import { getLocalizedService, normalizeOmniLocale, type OmniLocale } from './i18n';
import { useOmniDashboardStore } from './store';
import type { ServiceId } from './types';
import Link from 'next/link';

// ─── Types ─────────────────────────────────────────────────────────────────

type PanelSection =
  | 'menu'
  | 'services'
  | 'packages'
  | 'account'
  | 'settings'
  | 'apikeys'
  | 'projects'
  | 'library'
  | 'providerStatus';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  locale: string;
  isAuthenticated: boolean;
  userName: string;
}

// ─── Copy ───────────────────────────────────────────────────────────────────

const COPY = {
  ka: {
    services: 'სერვისები', packages: 'პაკეტები და ფასები', account: 'ანგარიში',
    settings: 'პარამეტრები', apikeys: 'API გასაღებები', providerStatus: 'AI სტატუსი', projects: 'ჩემი პროექტები',
    library: 'ბიბლიოთეკა', help: 'დახმარება', whatsNew: 'სიახლეები',
    signOut: 'გასვლა', login: 'შესვლა', signup: 'რეგისტრაცია',
    navigation: 'ნავიგაცია', content: 'კონტენტი', configuration: 'კონფიგურაცია',
    support: 'მხარდაჭერა', guest: 'სტუმარი', credits: 'კრედიტი',
    free: 'უფასო', monthly: 'თვიური', annual: 'წლიური', save: 'დაზოგე 30%',
    currentPlan: 'მიმდინარე', upgrade: 'გაუმჯობესება', getStarted: 'დაწყება',
    buyCredits: 'კრედიტების ყიდვა', secureStorage: 'უსაფრთხო შენახვა',
    keystoreInfo: 'გასაღებები დაშიფრულია ბრაუზერში',
    notConfigured: 'კონფიგურაცია არ არის', configured: 'კონფიგურირებული',
    save2: 'შენახვა', remove: 'წაშლა', cancel: 'გაუქმება', edit: 'რედაქტირება', add: 'დამატება',
    noProjects: 'პროექტები ვერ მოიძებნა', searchProjects: 'პროექტის ძებნა...',
    all: 'ყველა', images: 'სურათები', videos: 'ვიდეოები', music2: 'მუსიკა',
    prompts: 'Prompt-ები', styles: 'სტილები', presets: 'პრესეტები', templates: 'შაბლონები',
    language: 'ენა', notifications: 'შეტყობინებები', privacy: 'კონფიდენციალობა',
    appearance: 'გარეგნობა', version: 'ვერსია', website: 'ვებსაიტი', contact: 'კონტაქტი',
    rateApp: 'შეფასება', haptics: 'ვიბრაცია', animations: 'ანიმაციები',
    genQuality: 'გენერაციის ხარისხი', autoSave: 'ავტომატური შენახვა',
    genComplete: 'გენერაცია დასრულდა', lowCredits: 'დაბალი კრედიტი', updates: 'განახლებები',
    voiceStorage: 'ხმის მონაცემები', analytics: 'ანალიტიკა', crashReports: 'ავარიების ანგარიში',
    deleteData: 'მონაცემების წაშლა', clearCache: 'ქეშის გასუფთავება', cacheSize: 'ქეშის ზომა',
  },
  en: {
    services: 'Services', packages: 'Packages & Pricing', account: 'Account',
    settings: 'Settings', apikeys: 'API Keys', providerStatus: 'AI Status', projects: 'My Projects',
    library: 'Library', help: 'Help & FAQ', whatsNew: "What's New",
    signOut: 'Sign Out', login: 'Log In', signup: 'Sign Up',
    navigation: 'Navigation', content: 'Content', configuration: 'Configuration',
    support: 'Support', guest: 'Guest', credits: 'credits',
    free: 'Free', monthly: 'Monthly', annual: 'Annual', save: 'Save 30%',
    currentPlan: 'Current Plan', upgrade: 'Upgrade', getStarted: 'Get Started',
    buyCredits: 'Buy Credits', secureStorage: 'Secure Key Storage',
    keystoreInfo: 'Keys are encrypted in your browser session',
    notConfigured: 'Not configured', configured: 'Configured',
    save2: 'Save', remove: 'Remove', cancel: 'Cancel', edit: 'Edit', add: 'Add',
    noProjects: 'No projects found', searchProjects: 'Search projects...',
    all: 'All', images: 'Images', videos: 'Videos', music2: 'Music',
    prompts: 'Prompts', styles: 'Styles', presets: 'Presets', templates: 'Templates',
    language: 'Language', notifications: 'Notifications', privacy: 'Privacy',
    appearance: 'Appearance', version: 'Version', website: 'Website', contact: 'Contact',
    rateApp: 'Rate App', haptics: 'Haptics', animations: 'Animations',
    genQuality: 'Generation Quality', autoSave: 'Auto-Save Results',
    genComplete: 'Generation Complete', lowCredits: 'Low Credits Alert', updates: 'Product Updates',
    voiceStorage: 'Voice Data Storage', analytics: 'Usage Analytics', crashReports: 'Crash Reports',
    deleteData: 'Delete All Data', clearCache: 'Clear Cache', cacheSize: 'Cache Size',
  },
  ru: {
    services: 'Сервисы', packages: 'Пакеты и цены', account: 'Аккаунт',
    settings: 'Настройки', apikeys: 'API Ключи', providerStatus: 'AI Статус', projects: 'Мои проекты',
    library: 'Библиотека', help: 'Помощь', whatsNew: 'Что нового',
    signOut: 'Выйти', login: 'Войти', signup: 'Регистрация',
    navigation: 'Навигация', content: 'Контент', configuration: 'Конфигурация',
    support: 'Поддержка', guest: 'Гость', credits: 'кредитов',
    free: 'Бесплатно', monthly: 'В месяц', annual: 'В год', save: 'Скидка 30%',
    currentPlan: 'Текущий план', upgrade: 'Улучшить', getStarted: 'Начать',
    buyCredits: 'Купить кредиты', secureStorage: 'Безопасное хранение',
    keystoreInfo: 'Ключи зашифрованы в браузере',
    notConfigured: 'Не настроено', configured: 'Настроено',
    save2: 'Сохранить', remove: 'Удалить', cancel: 'Отмена', edit: 'Изменить', add: 'Добавить',
    noProjects: 'Проекты не найдены', searchProjects: 'Поиск проектов...',
    all: 'Все', images: 'Изображения', videos: 'Видео', music2: 'Музыка',
    prompts: 'Промпты', styles: 'Стили', presets: 'Пресеты', templates: 'Шаблоны',
    language: 'Язык', notifications: 'Уведомления', privacy: 'Конфиденциальность',
    appearance: 'Внешний вид', version: 'Версия', website: 'Сайт', contact: 'Контакт',
    rateApp: 'Оценить', haptics: 'Вибрация', animations: 'Анимации',
    genQuality: 'Качество генерации', autoSave: 'Автосохранение',
    genComplete: 'Генерация завершена', lowCredits: 'Мало кредитов', updates: 'Обновления',
    voiceStorage: 'Хранение голоса', analytics: 'Аналитика', crashReports: 'Отчёты об ошибках',
    deleteData: 'Удалить данные', clearCache: 'Очистить кэш', cacheSize: 'Размер кэша',
  },
} as const;

// ─── API Key definitions ────────────────────────────────────────────────────

const API_KEYS_DEF = [
  { id: 'elevenlabs', label: 'ElevenLabs', placeholder: 'sk_...', color: '#0284c7', icon: '🎙' },
  { id: 'heygen',     label: 'HeyGen',     placeholder: 'NjYy...', color: '#00d4ff', icon: '👤' },
  { id: 'replicate',  label: 'Replicate',  placeholder: 'r8_...',  color: '#00c896', icon: '🖥' },
  { id: 'openai',     label: 'OpenAI',     placeholder: 'sk-...',  color: '#10a37f', icon: '✦' },
  { id: 'anthropic',  label: 'Anthropic',  placeholder: 'sk-ant-...', color: '#f59e0b', icon: '◉' },
  { id: 'google',     label: 'Google AI',  placeholder: 'AIza...', color: '#4285F4', icon: '⬡' },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export function DashboardSidePanel({ isOpen, onClose, locale, isAuthenticated, userName }: Props) {
  const loc = (normalizeOmniLocale(locale) as OmniLocale) || 'en';
  const c = COPY[loc] || COPY.en;

  const [section, setSection] = useState<PanelSection>('menu');
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState('all');
  const [libraryTab, setLibraryTab] = useState('prompts');
  const [settingsHaptics, setSettingsHaptics] = useState(true);
  const [settingsAnimations, setSettingsAnimations] = useState(true);
  const [settingsAutoSave, setSettingsAutoSave] = useState(true);
  const [settingsQuality, setSettingsQuality] = useState('balanced');
  const [notifGeneration, setNotifGeneration] = useState(true);
  const [notifCredits, setNotifCredits] = useState(true);
  const [notifMarketing, setNotifMarketing] = useState(false);
  const [voiceStorage, setVoiceStorage] = useState(false);
  const [analytics, setAnalytics] = useState(true);

  const setActiveService = useOmniDashboardStore((s) => s.setActiveService);
  const credits = useOmniDashboardStore((s) => s.credits);

  // Reset to menu when closed
  useEffect(() => {
    if (!isOpen) setTimeout(() => setSection('menu'), 300);
  }, [isOpen]);

  const selectService = (id: ServiceId) => {
    setActiveService(id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omni:focus-composer'));
    }
    onClose();
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Dim overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 40 }}
            className="absolute inset-y-0 left-0 z-50 flex flex-col"
            style={{
              width: 'min(82vw, 340px)',
              background: 'rgba(6, 8, 18, 0.98)',
              borderRight: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                {section !== 'menu' && (
                  <button
                    onClick={() => setSection('menu')}
                    className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <span className="text-sm font-semibold text-white/90">
                  {section === 'menu' ? 'myavatar.ge' : c[section as keyof typeof c] ?? section}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {section === 'menu' && (
                  <motion.div key="menu" {...fadeSlide}>
                    {renderMenu({ c, isAuthenticated, userName, credits, setSection, loc, onClose })}
                  </motion.div>
                )}
                {section === 'services' && (
                  <motion.div key="services" {...fadeSlide}>
                    {renderServices({ loc, selectService })}
                  </motion.div>
                )}
                {section === 'packages' && (
                  <motion.div key="packages" {...fadeSlide}>
                    {renderPackages({ c, billing, setBilling })}
                  </motion.div>
                )}
                {section === 'account' && (
                  <motion.div key="account" {...fadeSlide}>
                    {renderAccount({ c, isAuthenticated, userName, locale })}
                  </motion.div>
                )}
                {section === 'settings' && (
                  <motion.div key="settings" {...fadeSlide}>
                    {renderSettings({
                      c, loc,
                      settingsHaptics, setSettingsHaptics,
                      settingsAnimations, setSettingsAnimations,
                      settingsAutoSave, setSettingsAutoSave,
                      settingsQuality, setSettingsQuality,
                      notifGeneration, setNotifGeneration,
                      notifCredits, setNotifCredits,
                      notifMarketing, setNotifMarketing,
                      voiceStorage, setVoiceStorage,
                      analytics, setAnalytics,
                    })}
                  </motion.div>
                )}
                {section === 'apikeys' && (
                  <motion.div key="apikeys" {...fadeSlide}>
                    {renderAPIKeys({ c, apiKeys, setApiKeys, editingKey, setEditingKey, keyDraft, setKeyDraft, revealedKeys, setRevealedKeys, copiedKey, setCopiedKey })}
                  </motion.div>
                )}
                {section === 'providerStatus' && (
                  <motion.div key="providerStatus" {...fadeSlide}>
                    <ProviderStatusList locale={loc} />
                  </motion.div>
                )}
                {section === 'projects' && (
                  <motion.div key="projects" {...fadeSlide}>
                    {renderProjects({ c, projectFilter, setProjectFilter })}
                  </motion.div>
                )}
                {section === 'library' && (
                  <motion.div key="library" {...fadeSlide}>
                    {renderLibrary({ c, libraryTab, setLibraryTab })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Copy type (union of all locales) ────────────────────────────────────

type CopyDict = typeof COPY[keyof typeof COPY];

// ─── Animation variant ────────────────────────────────────────────────────

const fadeSlide = {
  initial: { opacity: 0, x: 8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
  transition: { duration: 0.18 },
};

// ─── MENU ────────────────────────────────────────────────────────────────────

function renderMenu({ c, isAuthenticated, userName, credits, setSection, loc, onClose }: {
  c: CopyDict, isAuthenticated: boolean, userName: string,
  credits: number, setSection: (s: PanelSection) => void,
  loc: OmniLocale, onClose: () => void
}) {
  const navSection = (title: string, items: { icon: React.ReactNode; label: string; color: string; onClick: () => void; badge?: string }[]) => (
    <div className="px-2 py-2">
      <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 px-2 pb-1">{title}</p>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition hover:bg-white/6 group"
        >
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
            style={{ background: `${item.color}18` }}
          >
            <span style={{ color: item.color }}>{item.icon}</span>
          </span>
          <span className="flex-1 text-[13.5px] font-medium text-white/80 group-hover:text-white transition">{item.label}</span>
          {item.badge && (
            <span className="text-[10px] font-bold bg-cyan-500 text-white px-1.5 py-0.5 rounded-full">{item.badge}</span>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-white/25 group-hover:text-white/50 transition" />
        </button>
      ))}
    </div>
  );

  return (
    <div className="pb-4">
      {/* Profile / Auth header */}
      <div className="px-4 py-4 border-b border-white/6">
        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white"
              style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.3), rgba(2,132,199,0.3))' }}>
              {userName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{userName}</p>
              <p className="text-[11px] text-white/45">
                <span className="text-cyan-400 font-bold">{credits.toLocaleString()}</span> {c.credits}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Link href={`/${loc}/login`} onClick={onClose}
              className="flex-1 text-center py-2 rounded-xl text-sm font-semibold text-white/80 border border-white/15 hover:border-white/25 hover:bg-white/6 transition">
              {c.login}
            </Link>
            <Link href={`/${loc}/signup`} onClick={onClose}
              className="flex-1 text-center py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.85), rgba(2,132,199,0.85))' }}>
              {c.signup}
            </Link>
          </div>
        )}
      </div>

      {/* Navigation */}
      {navSection(c.navigation, [
        { icon: <MessageSquare className="w-4 h-4" />, label: 'Agent G', color: '#0284c7', onClick: onClose },
        { icon: '✦', label: c.services, color: '#00d4ff', onClick: () => setSection('services') },
      ])}

      <div className="mx-4 h-px bg-white/6" />

      {/* Account */}
      {navSection(c.account, [
        { icon: <User className="w-4 h-4" />, label: c.account, color: '#00d4ff', onClick: () => setSection('account') },
        { icon: <Crown className="w-4 h-4" />, label: c.packages, color: '#f59e0b', onClick: () => setSection('packages') },
        { icon: <Zap className="w-4 h-4" />, label: `${credits.toLocaleString()} ${c.credits}`, color: '#00c896', onClick: () => setSection('packages') },
      ])}

      <div className="mx-4 h-px bg-white/6" />

      {/* Content */}
      {navSection(c.content, [
        { icon: <Folder className="w-4 h-4" />, label: c.projects, color: '#0284c7', onClick: () => setSection('projects') },
        { icon: <BookOpen className="w-4 h-4" />, label: c.library, color: '#00d4ff', onClick: () => setSection('library') },
      ])}

      <div className="mx-4 h-px bg-white/6" />

      {/* Configuration */}
      {navSection(c.configuration, [
        { icon: <Settings className="w-4 h-4" />, label: c.settings, color: '#9ca3af', onClick: () => setSection('settings') },
        { icon: <Key className="w-4 h-4" />, label: c.apikeys, color: '#f59e0b', onClick: () => setSection('apikeys') },
        { icon: <Activity className="w-4 h-4" />, label: c.providerStatus, color: '#10b981', onClick: () => setSection('providerStatus') },
      ])}

      <div className="mx-4 h-px bg-white/6" />

      {/* Support */}
      {navSection(c.support, [
        { icon: <HelpCircle className="w-4 h-4" />, label: c.help, color: '#00d4ff', onClick: onClose },
        { icon: <Sparkles className="w-4 h-4" />, label: c.whatsNew, color: '#0284c7', onClick: onClose },
      ])}

      {/* Sign out */}
      {isAuthenticated && (
        <div className="px-4 pt-2">
          <button
            onClick={onClose}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[13px] font-medium transition hover:bg-red-500/8"
            style={{ color: '#e83a3a' }}
          >
            <LogOut className="w-4 h-4" />
            {c.signOut}
          </button>
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-[10px] text-white/20 mt-4 pb-2">myavatar.ge · v1.0.0</p>
    </div>
  );
}

// ─── SERVICES ────────────────────────────────────────────────────────────────

function renderServices({ loc, selectService }: {
  loc: OmniLocale, selectService: (id: ServiceId) => void
}) {
  return (
    <div className="p-3 grid grid-cols-2 gap-2">
      {OMNI_SERVICES.map((service) => {
        const localized = getLocalizedService(service.id, loc);
        return (
          <button
            key={service.id}
            onClick={() => selectService(service.id)}
            className="text-left p-3 rounded-2xl border transition hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: `${service.accent}0d`,
              borderColor: `${service.accent}28`,
            }}
          >
            <p className="text-xs font-bold mb-0.5" style={{ color: service.accent }}>{localized.title}</p>
            <p className="text-[11px] text-white/45 leading-tight">{localized.subtitle}</p>
          </button>
        );
      })}
    </div>
  );
}

// ─── PACKAGES ────────────────────────────────────────────────────────────────

const PLANS = [
  { id: 'starter', name: 'Starter', price: { monthly: 0, annual: 0 }, credits: 50, color: '#00c896', features: ['50 credits/mo', 'Images & Music', 'Agent G chat', '500MB storage'] },
  { id: 'pro',     name: 'Pro',     price: { monthly: 19, annual: 13 }, credits: 500, color: '#00d4ff', popular: true, features: ['500 credits/mo', 'All services', 'Live voice mode', '10GB storage', 'Priority generation', 'Voice cloning'] },
  { id: 'studio',  name: 'Studio',  price: { monthly: 49, annual: 34 }, credits: 2000, color: '#0284c7', features: ['2000 credits/mo', 'All services', 'HeyGen avatars', 'Unlimited storage', 'API access', 'Podcast studio'] },
];
const CREDIT_PACKS = [
  { credits: 100, price: 3.99, bonus: 0 },
  { credits: 300, price: 9.99, bonus: 30, label: '+10%' },
  { credits: 750, price: 19.99, bonus: 150, label: '+20%' },
  { credits: 2000, price: 39.99, bonus: 600, label: 'Best' },
];

function renderPackages({ c, billing, setBilling }: {
  c: CopyDict, billing: string, setBilling: (b: 'monthly' | 'annual') => void
}) {
  return (
    <div className="p-4 space-y-4">
      {/* Billing toggle */}
      <div className="flex rounded-xl overflow-hidden border border-white/10 text-[12px] font-semibold">
        {(['monthly', 'annual'] as const).map((b) => (
          <button key={b} onClick={() => setBilling(b)}
            className={`flex-1 py-2 transition ${billing === b ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/50 hover:text-white/70'}`}>
            {b === 'monthly' ? c.monthly : c.annual}
            {b === 'annual' && <span className="ml-1 text-[10px] text-emerald-400">({c.save})</span>}
          </button>
        ))}
      </div>

      {/* Plan cards */}
      {PLANS.map((plan) => (
        <div key={plan.id} className="rounded-2xl border p-4 space-y-3 relative"
          style={{ background: `${plan.color}08`, borderColor: plan.popular ? `${plan.color}50` : 'rgba(255,255,255,0.08)' }}>
          {plan.popular && (
            <span className="absolute -top-2.5 right-4 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
              style={{ background: plan.color }}>POPULAR</span>
          )}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-black tracking-wider uppercase" style={{ color: plan.color }}>{plan.name}</p>
              <p className="text-2xl font-black text-white mt-0.5">
                {plan.price[billing as 'monthly' | 'annual'] === 0 ? c.free : `$${plan.price[billing as 'monthly' | 'annual']}`}
                {plan.price[billing as 'monthly' | 'annual'] > 0 && <span className="text-xs font-normal text-white/40">/mo</span>}
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: `${plan.color}15`, color: plan.color }}>
              ⚡ {plan.credits}/mo
            </span>
          </div>
          <div className="space-y-1">
            {plan.features.map((f, i) => (
              <p key={i} className="text-[11px] text-white/55 flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span> {f}
              </p>
            ))}
          </div>
          <button className="w-full py-2 rounded-xl text-sm font-bold transition"
            style={{ background: `${plan.color}22`, color: plan.color, border: `1px solid ${plan.color}30` }}>
            {c.getStarted}
          </button>
        </div>
      ))}

      {/* Credit packs */}
      <p className="text-[11px] font-bold tracking-wider uppercase text-white/40 pt-2">{c.buyCredits}</p>
      {CREDIT_PACKS.map((pack, i) => (
        <button key={i} className="w-full flex items-center justify-between p-3 rounded-xl border border-white/10 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚡</span>
            <div className="text-left">
              <p className="text-sm font-bold text-white">{pack.credits + pack.bonus} credits</p>
              {pack.bonus > 0 && <p className="text-[10px] text-emerald-400">{pack.credits} + {pack.bonus} bonus</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-white">${pack.price}</p>
            {pack.label && <p className="text-[10px] font-bold text-emerald-400">{pack.label}</p>}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── ACCOUNT ─────────────────────────────────────────────────────────────────

function renderAccount({ c, isAuthenticated, userName, locale }: {
  c: CopyDict, isAuthenticated: boolean, userName: string, locale: string
}) {
  if (!isAuthenticated) {
    return (
      <div className="p-6 flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
          style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)' }}>
          👤
        </div>
        <div>
          <p className="font-bold text-white text-base mb-1">{c.guest}</p>
          <p className="text-[12px] text-white/45">შეხვიდე ანგარიშში სრული ფუნქციონალისთვის</p>
        </div>
        <Link href={`/${locale}/login`}
          className="w-full py-3 rounded-xl text-sm font-bold text-white text-center"
          style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.8), rgba(2,132,199,0.8))' }}>
          {c.login}
        </Link>
        <Link href={`/${locale}/signup`}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white/70 border border-white/15 text-center hover:border-white/25 transition">
          {c.signup}
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Avatar */}
      <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white"
          style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.25), rgba(2,132,199,0.25))' }}>
          {userName.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-bold text-white">{userName}</p>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,212,255,0.15)', color: '#00d4ff' }}>Pro</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[['188', 'Generations', '✦'], ['24', 'Tracks', '♪'], ['47h', 'Saved', '⏱']].map(([val, lbl, icon]) => (
          <div key={lbl} className="text-center p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-sm text-white/40">{icon}</p>
            <p className="text-base font-black text-white">{val}</p>
            <p className="text-[10px] text-white/40">{lbl}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      {[
        { label: 'Edit Profile', icon: '✏️' },
        { label: 'Billing History', icon: '🧾' },
        { label: 'Referrals', icon: '🔗' },
        { label: 'Delete Account', icon: '🗑', danger: true },
      ].map((item) => (
        <button key={item.label}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm border transition ${
            item.danger ? 'border-red-500/15 text-red-400 hover:bg-red-500/8' : 'border-white/10 text-white/70 hover:bg-white/5 hover:text-white'
          }`}>
          <span>{item.icon}</span>
          <span className="font-medium">{item.label}</span>
          <ChevronRight className="w-3.5 h-3.5 ml-auto text-white/25" />
        </button>
      ))}
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

function renderSettings({ c, loc, settingsHaptics, setSettingsHaptics, settingsAnimations, setSettingsAnimations,
  settingsAutoSave, setSettingsAutoSave, settingsQuality, setSettingsQuality,
  notifGeneration, setNotifGeneration, notifCredits, setNotifCredits, notifMarketing, setNotifMarketing,
  voiceStorage, setVoiceStorage, analytics, setAnalytics }: {
  c: CopyDict;
  loc: OmniLocale;
  settingsHaptics: boolean; setSettingsHaptics: (v: boolean) => void;
  settingsAnimations: boolean; setSettingsAnimations: (v: boolean) => void;
  settingsAutoSave: boolean; setSettingsAutoSave: (v: boolean) => void;
  settingsQuality: string; setSettingsQuality: (v: string) => void;
  notifGeneration: boolean; setNotifGeneration: (v: boolean) => void;
  notifCredits: boolean; setNotifCredits: (v: boolean) => void;
  notifMarketing: boolean; setNotifMarketing: (v: boolean) => void;
  voiceStorage: boolean; setVoiceStorage: (v: boolean) => void;
  analytics: boolean; setAnalytics: (v: boolean) => void;
}) {

  const Toggle = ({ on, toggle }: { on: boolean; toggle: () => void }) => (
    <button onClick={toggle} className={`relative inline-flex w-9 h-5 rounded-full transition ${on ? 'bg-cyan-500' : 'bg-white/15'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );

  const SettingRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-3 border-b border-white/5">
      <span className="text-[13px] text-white/70">{label}</span>
      {children}
    </div>
  );

  const SectionTitle = ({ title }: { title: string }) => (
    <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 pt-4 pb-1">{title}</p>
  );

  const languages = [{ code: 'ka', flag: '🇬🇪', name: 'ქართული' }, { code: 'en', flag: '🇺🇸', name: 'English' }, { code: 'ru', flag: '🇷🇺', name: 'Русский' }];

  return (
    <div className="px-4 pb-6">
      <SectionTitle title={c.language} />
      <div className="flex gap-2">
        {languages.map(lang => (
          <Link key={lang.code} href={`/${lang.code}/dashboard`}
            className={`flex-1 flex flex-col items-center py-2 rounded-xl border text-[11px] transition ${loc === lang.code ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-white/10 text-white/50 hover:text-white/80'}`}>
            <span className="text-base">{lang.flag}</span>
            <span className="font-medium mt-0.5">{lang.name}</span>
          </Link>
        ))}
      </div>

      <SectionTitle title={c.appearance} />
      <SettingRow label={c.haptics}><Toggle on={settingsHaptics} toggle={() => setSettingsHaptics(!settingsHaptics)} /></SettingRow>
      <SettingRow label={c.animations}><Toggle on={settingsAnimations} toggle={() => setSettingsAnimations(!settingsAnimations)} /></SettingRow>
      <SettingRow label={c.autoSave}><Toggle on={settingsAutoSave} toggle={() => setSettingsAutoSave(!settingsAutoSave)} /></SettingRow>
      <SettingRow label={c.genQuality}>
        <select value={settingsQuality} onChange={e => setSettingsQuality(e.target.value)}
          className="bg-transparent text-[12px] text-white/60 border border-white/15 rounded-lg px-2 py-1">
          <option value="fast">Fast</option>
          <option value="balanced">Balanced</option>
          <option value="best">Best</option>
        </select>
      </SettingRow>

      <SectionTitle title={c.notifications} />
      <SettingRow label={c.genComplete}><Toggle on={notifGeneration} toggle={() => setNotifGeneration(!notifGeneration)} /></SettingRow>
      <SettingRow label={c.lowCredits}><Toggle on={notifCredits} toggle={() => setNotifCredits(!notifCredits)} /></SettingRow>
      <SettingRow label={c.updates}><Toggle on={notifMarketing} toggle={() => setNotifMarketing(!notifMarketing)} /></SettingRow>

      <SectionTitle title={c.privacy} />
      <SettingRow label={c.voiceStorage}><Toggle on={voiceStorage} toggle={() => setVoiceStorage(!voiceStorage)} /></SettingRow>
      <SettingRow label={c.analytics}><Toggle on={analytics} toggle={() => setAnalytics(!analytics)} /></SettingRow>

      <SectionTitle title="About" />
      {[
        { label: c.version, val: '1.0.0 (1)' },
        { label: c.website, val: 'myavatar.ge', link: '/' },
        { label: c.contact, val: 'support', link: '/' },
        { label: c.rateApp, val: '⭐⭐⭐⭐⭐', link: '/' },
      ].map(item => (
        <div key={item.label} className="flex items-center justify-between py-3 border-b border-white/5">
          <span className="text-[13px] text-white/70">{item.label}</span>
          <span className="text-[12px] text-cyan-400/80">{item.val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── API KEYS ────────────────────────────────────────────────────────────────

function renderAPIKeys({ c, apiKeys, setApiKeys, editingKey, setEditingKey, keyDraft, setKeyDraft, revealedKeys, setRevealedKeys, copiedKey, setCopiedKey }: {
  c: CopyDict;
  apiKeys: Record<string, string>;
  setApiKeys: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  editingKey: string | null;
  setEditingKey: (v: string | null) => void;
  keyDraft: string;
  setKeyDraft: (v: string) => void;
  revealedKeys: Set<string>;
  setRevealedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  copiedKey: string | null;
  setCopiedKey: (v: string | null) => void;
}) {
  const masked = (v: string) => v.length > 8 ? `${v.slice(0, 6)}••••${v.slice(-4)}` : '••••••••';

  const saveKey = (id: string) => {
    setApiKeys((prev) => ({ ...prev, [id]: keyDraft }));
    setEditingKey(null);
    setKeyDraft('');
  };

  const copyKey = (id: string, val: string) => {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const toggleReveal = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="p-4 space-y-3">
      {/* Info banner */}
      <div className="flex gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}>
        <ShieldCheck className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-white/55 leading-relaxed">{c.keystoreInfo}</p>
      </div>

      {API_KEYS_DEF.map((def) => {
        const value = apiKeys[def.id] || '';
        const isEditing = editingKey === def.id;
        const revealed = revealedKeys.has(def.id);

        return (
          <div key={def.id} className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <span className="text-lg w-7 text-center">{def.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white">{def.label}</p>
                {value && !isEditing && (
                  <p className="text-[10px] font-mono text-white/35 truncate">{revealed ? value : masked(value)}</p>
                )}
                {!value && !isEditing && (
                  <p className="text-[10px] text-white/25">{c.notConfigured}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {value && (
                  <>
                    <button onClick={() => toggleReveal(def.id)} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition">
                      {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => copyKey(def.id, value)} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition">
                      {copiedKey === def.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setEditingKey(def.id); setKeyDraft(value); }}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition"
                  style={{ background: value ? 'rgba(255,255,255,0.05)' : 'rgba(0,212,255,0.1)', color: value ? 'rgba(255,255,255,0.5)' : '#00d4ff', border: `1px solid ${value ? 'rgba(255,255,255,0.08)' : 'rgba(0,212,255,0.25)'}` }}>
                  {value ? c.edit : c.add}
                </button>
              </div>
            </div>

            {isEditing && (
              <div className="px-3 pb-3 space-y-2 border-t border-white/6 pt-2">
                <input
                  type="password"
                  value={keyDraft}
                  onChange={e => setKeyDraft(e.target.value)}
                  placeholder={def.placeholder}
                  autoComplete="off"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[12px] font-mono text-white placeholder-white/25 focus:outline-none focus:border-cyan-500/40"
                />
                <div className="flex gap-2">
                  <button onClick={() => saveKey(def.id)}
                    className="flex-1 py-1.5 rounded-xl text-[12px] font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.7), rgba(2,132,199,0.7))' }}>
                    {c.save2}
                  </button>
                  {value && (
                    <button onClick={() => { setApiKeys((p) => ({ ...p, [def.id]: '' })); setEditingKey(null); }}
                      className="px-3 py-1.5 rounded-xl text-[12px] font-semibold text-red-400 border border-red-500/20 hover:bg-red-500/8 transition">
                      {c.remove}
                    </button>
                  )}
                  <button onClick={() => { setEditingKey(null); setKeyDraft(''); }}
                    className="px-3 py-1.5 rounded-xl text-[12px] text-white/40 border border-white/10 hover:bg-white/5 transition">
                    {c.cancel}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── PROJECTS ────────────────────────────────────────────────────────────────

const MOCK_PROJECTS = [
  { id: '1', title: 'Tbilisi Night Video', type: 'video', color: '#0284c7', icon: '🎬', service: 'Video Studio', ago: '1h ago' },
  { id: '2', title: 'Mountain Sunset', type: 'image', color: '#00d4ff', icon: '🖼', service: 'Image', ago: '3h ago' },
  { id: '3', title: 'Georgian Folk Remix', type: 'music', color: '#00c896', icon: '🎵', service: 'Music Studio', ago: '1d ago' },
  { id: '4', title: 'AI Avatar — Nino', type: 'avatar', color: '#f59e0b', icon: '👤', service: 'Avatar', ago: '2d ago' },
  { id: '5', title: 'Product Launch Script', type: 'text', color: '#9ca3af', icon: '📄', service: 'Content Writer', ago: '3d ago' },
  { id: '6', title: 'City Ambient Loop', type: 'music', color: '#0284c7', icon: '🎶', service: 'Music Studio', ago: '4d ago' },
];

const PROJ_FILTERS = ['all', 'image', 'video', 'music', 'text'];

function renderProjects({ c, projectFilter, setProjectFilter }: {
  c: CopyDict, projectFilter: string, setProjectFilter: (f: string) => void
}) {
  const filtered = projectFilter === 'all' ? MOCK_PROJECTS : MOCK_PROJECTS.filter(p => p.type === projectFilter);

  return (
    <div className="p-3 space-y-3">
      {/* Filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {PROJ_FILTERS.map(f => (
          <button key={f} onClick={() => setProjectFilter(f)}
            className={`flex-shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full transition ${
              projectFilter === f ? 'bg-cyan-500/18 text-cyan-300 border border-cyan-500/35' : 'text-white/45 border border-white/10 hover:text-white/70'
            }`}>
            {f === 'all' ? c.all : f === 'image' ? c.images : f === 'video' ? c.videos : f === 'music' ? c.music2 : 'Text'}
          </button>
        ))}
      </div>

      {/* Project list */}
      {filtered.length === 0 ? (
        <p className="text-center text-white/35 text-sm py-8">{c.noProjects}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(project => (
            <button key={project.id}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/6 hover:border-white/15 hover:bg-white/3 transition text-left">
              <span className="text-xl w-8 text-center">{project.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{project.title}</p>
                <p className="text-[10px] text-white/35">{project.service} · {project.ago}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LIBRARY ─────────────────────────────────────────────────────────────────

const LIBRARY_TABS = ['prompts', 'styles', 'presets', 'templates'] as const;

const LIBRARY_DATA = {
  prompts: [
    { title: 'Cinematic Tbilisi Night', service: 'Video Studio', color: '#0284c7', text: 'Cinematic Tbilisi night aerial with neon lights and mist' },
    { title: 'Georgian Mountain', service: 'Image', color: '#00d4ff', text: 'Georgian mountain village at golden hour, hyperrealistic' },
    { title: 'Folk Electronic', service: 'Music Studio', color: '#00c896', text: 'Ambient electronic with Georgian folk instruments, 120 BPM' },
  ],
  styles: [
    { title: 'Neo-Cosmic Futurism', tags: ['dark', 'neon'], color: '#00d4ff' },
    { title: 'Georgian Folk', tags: ['folk', 'warm'], color: '#00c896' },
    { title: 'Cyberpunk Tbilisi', tags: ['urban', 'neon'], color: '#0284c7' },
    { title: 'Cinematic Drama', tags: ['epic', 'moody'], color: '#f59e0b' },
  ],
  presets: [
    { title: 'Quick Portrait', desc: '20s professional headshot', icon: '👤', color: '#00d4ff' },
    { title: '30s Music Loop', desc: 'Background, any style', icon: '🎵', color: '#00c896' },
    { title: 'Social Video', desc: '9:16 format, 15s', icon: '🎬', color: '#0284c7' },
    { title: 'Blog Post', desc: '800-word SEO article', icon: '📄', color: '#9ca3af' },
  ],
  templates: [
    { title: 'Brand Identity Kit', steps: 4, icon: '🎨', color: '#00d4ff' },
    { title: 'Music Release', steps: 3, icon: '🎵', color: '#00c896' },
    { title: 'Podcast Episode', steps: 3, icon: '🎙', color: '#0284c7' },
    { title: 'Product Launch', steps: 5, icon: '🚀', color: '#f59e0b' },
  ],
};

function renderLibrary({ c, libraryTab, setLibraryTab }: {
  c: CopyDict, libraryTab: string, setLibraryTab: (t: string) => void
}) {
  return (
    <div className="p-3 space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 bg-white/4 rounded-xl p-1">
        {LIBRARY_TABS.map(tab => (
          <button key={tab} onClick={() => setLibraryTab(tab)}
            className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition ${
              libraryTab === tab ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/60'
            }`}>
            {c[tab as keyof typeof c] ?? tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {libraryTab === 'prompts' && (
        <div className="space-y-2">
          {LIBRARY_DATA.prompts.map((item, i) => (
            <button key={i} className="w-full text-left p-3 rounded-xl border border-white/6 hover:border-white/15 transition group">
              <div className="flex items-start gap-2">
                <span className="text-xs font-black px-1.5 py-0.5 rounded" style={{ background: `${item.color}18`, color: item.color }}>
                  {item.service.slice(0, 2).toUpperCase()}
                </span>
                <p className="flex-1 text-[12px] text-white/70 leading-relaxed group-hover:text-white/90 transition">{item.text}</p>
                <Copy className="w-3 h-3 text-white/20 flex-shrink-0 mt-0.5 group-hover:text-white/50 transition" />
              </div>
            </button>
          ))}
        </div>
      )}

      {libraryTab === 'styles' && (
        <div className="grid grid-cols-2 gap-2">
          {LIBRARY_DATA.styles.map((style, i) => (
            <button key={i} className="text-left p-3 rounded-xl border border-white/6 hover:border-white/15 transition"
              style={{ background: `${style.color}08` }}>
              <p className="text-[12px] font-bold text-white">{style.title}</p>
              <div className="flex gap-1 mt-1.5">
                {style.tags.map(tag => (
                  <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full text-white/40 bg-white/6">{tag}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {libraryTab === 'presets' && (
        <div className="space-y-2">
          {LIBRARY_DATA.presets.map((preset, i) => (
            <button key={i} className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/6 hover:border-white/15 hover:bg-white/3 transition text-left">
              <span className="text-lg">{preset.icon}</span>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-white">{preset.title}</p>
                <p className="text-[10px] text-white/40">{preset.desc}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/25" />
            </button>
          ))}
        </div>
      )}

      {libraryTab === 'templates' && (
        <div className="space-y-2">
          {LIBRARY_DATA.templates.map((tmpl, i) => (
            <button key={i} className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/6 hover:border-white/15 hover:bg-white/3 transition text-left"
              style={{ borderColor: `${tmpl.color}20` }}>
              <span className="text-xl">{tmpl.icon}</span>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-white">{tmpl.title}</p>
                <p className="text-[10px]" style={{ color: tmpl.color }}>{tmpl.steps} steps</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/25" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
