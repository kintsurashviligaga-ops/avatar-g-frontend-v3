/**
 * @jest-environment jsdom
 *
 * Music panel polish, Phase 7.6 M1–M4, behind NEXT_PUBLIC_MUSIC_UX_V2: off shows nothing new; on shows the summary line,
 * the lyrics section chips, why vocals are locked, and the sliders folded under "Advanced" with a dot when moved.
 */
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SLIDER_DEFAULT, type VocalGender } from '@/lib/ai/musicControls';
import { useCreditsBalance } from '@/store/useCreditsBalance';
import { MusicCreatePanel, type MusicCreatePanelProps } from './MusicCreatePanel';
import { resetMusicEnginesCache } from './useMusicEngines';
import { musicSummaryLine, slidersMoved } from './musicUxV2';

const STATUS = (vocals: boolean) => ({
  engines: { lyria: { configured: true, busy: false, controls: 'prompt' } },
  references: { cover: true, voice: true }, chain: ['lyria'], lengths: [30, 60, 90, 0], vocals,
});
const respond = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as unknown as Response);
let vocals = true;
const FLAG = process.env.NEXT_PUBLIC_MUSIC_UX_V2;

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('myavatar:music-ui-mode', 'advanced');
  resetMusicEnginesCache();
  vocals = true;
  useCreditsBalance.setState({ balance: 50, fetchedAt: Date.now(), inflight: null });
  global.fetch = jest.fn((url: string) => (String(url).includes('/api/ai/music/engines') ? respond(STATUS(vocals)) : respond({}))) as unknown as typeof fetch;
});
afterEach(() => { process.env.NEXT_PUBLIC_MUSIC_UX_V2 = FLAG; });

function Host() {
  const [lyrics, setLyrics] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [styleText, setStyleText] = useState('');
  const [styles, setStyles] = useState<string[]>(['pop']);
  const [vocal, setVocal] = useState<VocalGender>('female');
  const [sliders, setSliders] = useState({ weirdness: SLIDER_DEFAULT, styleInfluence: SLIDER_DEFAULT });
  const [duration, setDuration] = useState<MusicCreatePanelProps['duration']>(60);
  const [tempo, setTempo] = useState<'slow' | 'medium' | 'fast'>('medium');
  return (
    <MusicCreatePanel
      locale="en" isDesktop={false} guest={false}
      styleText={styleText} onStyleText={setStyleText} lyrics={lyrics} onLyrics={setLyrics}
      instrumental={instrumental} onInstrumental={setInstrumental} styles={styles} onStyles={setStyles}
      styleOptions={[{ id: 'pop', label: 'Pop' }]} vocal={vocal} onVocal={setVocal} sliders={sliders} onSliders={setSliders}
      duration={duration} onDuration={setDuration} tempo={tempo} onTempo={setTempo}
      templates={{ items: [], activeId: null, onPick: jest.fn() }}
      audio={null} audioMode="cover" onAudioMode={jest.fn()} onPickAudio={jest.fn()} onClearAudio={jest.fn()}
      recording={{ active: false, sec: 0, start: jest.fn(), stop: jest.fn() }}
      trainedVoice={{ available: false, on: false, onChange: jest.fn() }}
      onCreate={jest.fn()} result={{ track: null, actions: null, label: 'Music' }}
    />
  );
}

test('flag off: nothing new on screen', async () => {
  delete process.env.NEXT_PUBLIC_MUSIC_UX_V2;
  render(<Host />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  for (const id of ['music-summary', 'music-lyrics-sections', 'music-vocals-why', 'music-sliders-toggle']) expect(screen.queryByTestId(id)).toBeNull();
});

test('flag on: the summary line says what Create makes, at Create\'s own price', async () => {
  process.env.NEXT_PUBLIC_MUSIC_UX_V2 = 'true';
  render(<Host />);
  const line = await screen.findByTestId('music-summary');
  const price = screen.getByTestId('music-create').getAttribute('data-price');
  expect(line.textContent).toContain('You will get:');
  expect(line.textContent).toContain('60 s · vocals (female)');
  expect(line.textContent).toContain(`✦ ${price}`);
});

test('flag on: a section chip puts [Chorus] on its own line in the lyrics', async () => {
  process.env.NEXT_PUBLIC_MUSIC_UX_V2 = 'true';
  render(<Host />);
  const input = screen.getByTestId('music-lyrics-input') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: 'la la la' } });
  fireEvent.click(screen.getByTestId('music-section-chorus'));
  expect((screen.getByTestId('music-lyrics-input') as HTMLTextAreaElement).value).toBe('la la la\n\n[Chorus]\n');
});

test('flag on: locked vocals say why', async () => {
  process.env.NEXT_PUBLIC_MUSIC_UX_V2 = 'true';
  vocals = false;
  render(<Host />);
  expect(await screen.findByTestId('music-vocals-why')).toBeTruthy();
});

test('flag on: sliders sit under Advanced; the dot shows only when moved', () => {
  expect(slidersMoved({ weirdness: 50, styleInfluence: 50 })).toBe(false);
  expect(slidersMoved({ weirdness: 70, styleInfluence: 50 })).toBe(true);
  process.env.NEXT_PUBLIC_MUSIC_UX_V2 = 'true';
  render(<Host />);
  const more = screen.getByTestId('music-more');
  const toggle = more.querySelector('button[aria-expanded]') as HTMLButtonElement | null;
  if (!screen.queryByTestId('music-sliders-toggle') && toggle) fireEvent.click(toggle);
  const fold = screen.getByTestId('music-sliders-toggle');
  expect(screen.queryByTestId('music-sliders')).toBeNull();
  expect(screen.queryByTestId('music-sliders-moved')).toBeNull();
  fireEvent.click(fold);
  expect(screen.getByTestId('music-sliders')).toBeTruthy();
});

test('summary line copy in Georgian and for a full instrumental song', () => {
  expect(musicSummaryLine({ locale: 'ka', duration: 0, cover: false, instrumental: true, vocal: 'male', engine: 'Lyria 3 Pro', credits: 20 }))
    .toBe('სრული სიმღერა · ინსტრუმენტული · Lyria 3 Pro · ✦ 20');
  expect(musicSummaryLine({ locale: 'ru', duration: 90, cover: true, instrumental: false, vocal: 'auto', engine: 'Lyria', credits: 5 }))
    .toBe('30 с · вокал · Lyria · ✦ 5');
});
