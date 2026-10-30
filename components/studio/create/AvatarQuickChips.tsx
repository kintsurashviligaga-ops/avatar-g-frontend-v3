'use client';

/**
 * AvatarQuickChips — the avatar tool's quick settings in the chat box (the unified composer, GG 2026-10-25):
 * `სახე ▾ · ხმა ▾ · 9:16 ▾ · ⋯`.
 *
 * The SAME values as the avatar panel in OmniStudio (which stays mounted as the „მეტი პარამეტრი" layer): `lipGender` and
 * `lipFormat`, which the avatar send reads. The face chip names the face that will speak (an attached photo, the caller's
 * twin, a presenter, or none = the AI presenter) and opens the panel, whose gallery and photo upload are the face picker —
 * no second gallery. The Live call, consent and enrollment are not touched here.
 */
import { useRef, useState } from 'react';
import { Mic2, RectangleHorizontal, RectangleVertical, ScanFace, Square } from 'lucide-react';
import { OptionPicker } from './OptionPicker';
import { ServiceQuickSettings, type QuickChip } from '@/components/chat/composer/ServiceQuickSettings';

export type AvatarGender = 'auto' | 'female' | 'male';
export type AvatarFormat = '9:16' | '16:9' | '1:1';

const L = (locale: string, ka: string, en: string, ru: string) => (locale === 'en' ? en : locale === 'ru' ? ru : ka);
const FORMATS: readonly AvatarFormat[] = ['9:16', '16:9', '1:1'];
const GENDERS: readonly AvatarGender[] = ['auto', 'female', 'male'];

export function AvatarQuickChips(p: {
  locale: string;
  desktop: boolean;
  /** The face that will speak, already named in the locale. */
  faceName: string;
  gender: AvatarGender;
  onGender: (g: AvatarGender) => void;
  format: AvatarFormat;
  onFormat: (f: AvatarFormat) => void;
  onMore: () => void;
  moreExpanded: boolean;
  moreLabel: string;
}) {
  const { locale } = p;
  const [sheet, setSheet] = useState<'voice' | 'format' | null>(null);
  const voiceRef = useRef<HTMLButtonElement>(null);
  const formatRef = useRef<HTMLButtonElement>(null);
  const toggle = (s: 'voice' | 'format') => () => setSheet((cur) => (cur === s ? null : s));
  const close = () => setSheet(null);
  const genderName = (g: AvatarGender) => (g === 'female' ? L(locale, 'ქალი', 'Female', 'Женский') : g === 'male' ? L(locale, 'კაცი', 'Male', 'Мужской') : L(locale, 'ავტო', 'Auto', 'Авто'));
  const voiceWord = L(locale, 'ხმა', 'Voice', 'Голос');
  const formatWord = L(locale, 'ფორმატი', 'Format', 'Формат');
  const closeWord = L(locale, 'დახურვა', 'Close', 'Закрыть');
  const FormatIcon = p.format === '16:9' ? RectangleHorizontal : p.format === '1:1' ? Square : RectangleVertical;

  const chips: QuickChip[] = [
    { id: 'avatar-face', icon: <ScanFace size={15} />, label: L(locale, 'სახე', 'Face', 'Лицо'), value: p.faceName, onOpen: p.onMore, expanded: p.moreExpanded },
    { id: 'avatar-voice', icon: <Mic2 size={15} />, label: voiceWord, value: genderName(p.gender), onOpen: toggle('voice'), expanded: sheet === 'voice', chipRef: voiceRef },
    { id: 'avatar-format', icon: <FormatIcon size={15} />, label: formatWord, value: p.format, onOpen: toggle('format'), expanded: sheet === 'format', chipRef: formatRef },
  ];

  return (
    <>
      <ServiceQuickSettings chips={chips} onMore={p.onMore} moreExpanded={p.moreExpanded} moreLabel={p.moreLabel} testId="avatar-quick-settings" moreTestId="options-toggle" />
      <OptionPicker open={sheet === 'voice'} onClose={close} title={voiceWord} closeLabel={closeWord} value={p.gender} onSelect={p.onGender}
        options={GENDERS.map((g) => ({ value: g, label: genderName(g) }))} desktop={p.desktop} anchorRef={voiceRef} testId="quick-picker-avatar-voice" />
      <OptionPicker open={sheet === 'format'} onClose={close} title={formatWord} closeLabel={closeWord} value={p.format} onSelect={p.onFormat}
        options={FORMATS.map((f) => ({ value: f, label: f }))} desktop={p.desktop} anchorRef={formatRef} testId="quick-picker-avatar-format" />
    </>
  );
}
