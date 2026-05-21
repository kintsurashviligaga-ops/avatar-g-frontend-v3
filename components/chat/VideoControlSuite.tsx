'use client';

/**
 * VideoControlSuite — in-chat video assembly controls (One Window).
 *
 * A collapsible, ultra-minimal control panel the user opens before
 * triggering a video/avatar render. Emits a typed RenderSettings object
 * (transition · caption theme · vocal ducking · fps) that the chat folds
 * into the render Saga payload as plain JSON.
 *
 * Design (Module 6): black chat base, this panel is an ELEVATED charcoal
 * surface with a soft slate gradient — no heavy borders, restrained
 * indigo accent only on the active state. framer-motion micro-interactions.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Film, ChevronDown, Type, Volume2, Gauge } from 'lucide-react';
import {
  type RenderSettings,
  type TransitionType,
  type CaptionTheme,
  TRANSITIONS,
  CAPTION_THEMES,
  transitionLabel,
  captionThemeLabel,
} from '@/lib/orchestrator/render-settings';

type Lang = 'ka' | 'en' | 'ru';

interface VideoControlSuiteProps {
  locale: Lang;
  open: boolean;
  onToggle: () => void;
  settings: RenderSettings;
  onChange: (next: RenderSettings) => void;
}

const SURFACE = 'bg-gradient-to-b from-[#16181d] to-[#101216]';

export default function VideoControlSuite({ locale, open, onToggle, settings, onChange }: VideoControlSuiteProps) {
  const t = (ka: string, en: string, ru: string) => (locale === 'ka' ? ka : locale === 'ru' ? ru : en);
  const set = <K extends keyof RenderSettings>(k: K, v: RenderSettings[K]) => onChange({ ...settings, [k]: v });

  return (
    <div className="rounded-2xl overflow-hidden">
      <motion.button
        type="button"
        onClick={onToggle}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`w-full flex items-center gap-2 px-3.5 py-2.5 ${SURFACE} text-left transition-colors`}
      >
        <Film size={15} className="text-indigo-300" />
        <span className="flex-1 text-[13px] font-medium text-white/90">
          {t('ვიდეო-მონტაჟის პარამეტრები', 'Render settings', 'Параметры рендера')}
        </span>
        <span className="text-[11px] text-white/40 tabular-nums">
          {settings.fps}fps · {settings.vocalDuckingPct}%
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={15} className="text-white/45" />
        </motion.span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`${SURFACE} overflow-hidden`}
          >
            <div className="px-3.5 pb-3.5 pt-1 space-y-4">
              {/* Transition */}
              <Field icon={<Film size={13} />} label={t('გადასვლა', 'Transition', 'Переход')}>
                <Segmented
                  options={TRANSITIONS.map((tr: TransitionType) => ({ value: tr, label: transitionLabel(tr, locale) }))}
                  value={settings.transition}
                  onChange={(v) => set('transition', v as TransitionType)}
                />
              </Field>

              {/* Caption theme */}
              <Field icon={<Type size={13} />} label={t('სუბტიტრის თემა', 'Caption theme', 'Тема субтитров')}>
                <Segmented
                  options={CAPTION_THEMES.map((c: CaptionTheme) => ({ value: c, label: captionThemeLabel(c, locale) }))}
                  value={settings.captionTheme}
                  onChange={(v) => set('captionTheme', v as CaptionTheme)}
                />
              </Field>

              {/* Vocal ducking */}
              <Field icon={<Volume2 size={13} />} label={t('ხმის ჩახშობა', 'Vocal ducking', 'Приглушение музыки')}>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={0} max={100} step={5}
                    value={settings.vocalDuckingPct}
                    onChange={(e) => set('vocalDuckingPct', Number(e.target.value))}
                    className="flex-1 accent-indigo-400 h-1 cursor-pointer"
                    aria-label="Vocal ducking percent"
                  />
                  <span className="w-10 text-right text-[12px] font-semibold text-white tabular-nums">{settings.vocalDuckingPct}%</span>
                </div>
              </Field>

              {/* FPS */}
              <Field icon={<Gauge size={13} />} label={t('კადრები წამში', 'Frame rate', 'Частота кадров')}>
                <Segmented
                  options={[
                    { value: '24', label: t('24fps ნატივი', '24fps native', '24fps натив') },
                    { value: '60', label: t('60fps AI', '60fps AI', '60fps AI') },
                  ]}
                  value={String(settings.fps)}
                  onChange={(v) => set('fps', v === '60' ? 60 : 24)}
                />
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/55">
        <span className="text-white/40">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange }: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <motion.button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            whileHover={{ scale: active ? 1 : 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              active
                ? 'bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-400/40'
                : 'bg-white/[0.03] text-white/60 hover:text-white/85 hover:bg-white/[0.06]'
            }`}
          >
            {o.label}
          </motion.button>
        );
      })}
    </div>
  );
}
