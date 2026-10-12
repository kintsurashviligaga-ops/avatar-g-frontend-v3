import { kindsLine, montageEditorOpenedText, multiVideoRoute, namesLine, pickOneVideoText } from './chatMediaRoute';
import { detectStudioIntent } from './studioIntent';
import { beatMontageAsk } from '@/lib/agent/media/montageChat';
import type { AttachmentKind } from '@/lib/agent/media/montageChat';

const GG = 'ეს ოთხივე ფაილი გამოიყენე, ვიდეოები დაამონტაჟე, მუსიკას დაამთხვიე და შედეგი აქვე დამიბრუნე.';
const THREE_AND_TRACK: AttachmentKind[] = ['video', 'video', 'video', 'audio'];

describe('multiVideoRoute — two or more videos are never a one-video remix', () => {
  it("GG's Production sentence (3 clips + 1 MP3) is a montage, never the remix", () => {
    expect(multiVideoRoute(GG, THREE_AND_TRACK)).toBe('montage_editor');
    // …and Agent G's montage claims it when it is open (the chat checks that first).
    expect(beatMontageAsk(GG, THREE_AND_TRACK)).toBe(true);
  });

  it.each([
    ['დაამონტაჟე ეს ვიდეოები', ['video', 'video']],
    ['montage these clips', ['video', 'video', 'video']],
    ['склей эти видео под музыку', ['video', 'video', 'audio']],
    ['მუსიკას დაამთხვიე', ['video', 'video', 'audio']],
    ['put this song under these', ['video', 'video', 'audio']],
  ] as Array<[string, AttachmentKind[]]>)('%s → montage editor', (text, kinds) => {
    expect(multiVideoRoute(text, kinds)).toBe('montage_editor');
  });

  it('a one-video edit asked of several videos asks which one (nothing dropped)', () => {
    expect(multiVideoRoute('add subtitles: hello', ['video', 'video'])).toBe('pick_one_video');
    expect(multiVideoRoute('სუბტიტრები დაამატე: გამარჯობა', ['video', 'video', 'video'])).toBe('pick_one_video');
  });

  test('a word ABOUT the clips is not a clip to make: an analysis, a comparison, a description stays a question', () => {
    for (const t of ['ამ კლიპების ანალიზი გამიკეთე', 'კლიპების შედარება გამიკეთე', 'გამიკეთე ამ კლიპების მოკლე აღწერა', 'сделай клипам описание', 'создай клипу название', 'make me a clip description']) {
      expect([t, multiVideoRoute(t, ['video', 'video'])]).toEqual([t, 'video_question']);
    }
    for (const t of ['ამ ვიდეოებით კლიპი გამიკეთე', 'make me a clip from these', 'сделай клип из этих видео']) {
      expect([t, multiVideoRoute(t, ['video', 'video'])]).toEqual([t, 'montage_editor']);
    }
  });

  it('a question, or no words, is a question about all the videos', () => {
    expect(multiVideoRoute('', ['video', 'video'])).toBe('video_question');
    expect(multiVideoRoute('what happens in these videos?', ['video', 'video'])).toBe('video_question');
    expect(multiVideoRoute('რა ხდება ამ ვიდეოებში?', ['video', 'video', 'audio'])).toBe('video_question');
  });

  it('music words without a track are not a montage of clips with music', () => {
    expect(multiVideoRoute('which song fits these?', ['video', 'video'])).toBe('video_question');
  });

  it('fewer than two videos: not this rule (the one-video paths decide)', () => {
    expect(multiVideoRoute(GG, ['video', 'audio'])).toBeNull();
    expect(multiVideoRoute(GG, ['audio'])).toBeNull();
  });
});

describe('studio intent: the Georgian montage verb', () => {
  it.each(['დაამონტაჟე ეს ვიდეოები', 'გადაამონტაჟე ეს ვიდეო', 'დამიმონტაჟე ეს კლიპები', 'მონტაჟი გამიკეთე', 'შეაერთე ეს ვიდეოები'])('%s → montage', (t) => {
    expect(detectStudioIntent(t)?.service).toBe('montage');
  });
  it('a question about montage still opens nothing', () => {
    expect(detectStudioIntent('მონტაჟი რა ღირს?')).toBeNull();
  });
});

describe('the words for what was attached', () => {
  const items = [
    { kind: 'video' as const, name: 'clipA.mp4' },
    { kind: 'video' as const, name: 'clipB.mp4' },
    { kind: 'video' as const, name: 'clipC.mp4' },
    { kind: 'audio' as const, name: 'track.mp3' },
  ];

  it('counts and names, in order', () => {
    expect(kindsLine(items, 'ka')).toBe('3 ვიდეო + 1 აუდიო');
    expect(kindsLine(items, 'en')).toBe('3 videos + 1 audio');
    expect(namesLine(items, 'ka')).toBe('1. clipA.mp4, 2. clipB.mp4, 3. clipC.mp4, 4. track.mp3');
    expect(namesLine([{ kind: 'video' }], 'ru')).toBe('1. видео');
  });

  it('the editor message names every clip in order, the track as music, why, and that export is free', () => {
    const ka = montageEditorOpenedText(items, 'agent_closed', 'ka');
    expect(ka).toContain('1. clipA.mp4, 2. clipB.mp4, 3. clipC.mp4');
    expect(ka).toContain('**track.mp3** — მუსიკად');
    expect(ka).toMatch(/ჩართული არ არის/);
    expect(ka).toMatch(/კრედიტი არ იხარჯება/);
    const en = montageEditorOpenedText([...items, { kind: 'audio', name: 'second.mp3' }], 'agent_shape', 'en');
    expect(en).toContain('all 3 clips');
    expect(en).toContain('second.mp3 is not used');
  });

  it('the which-one question lists the videos', () => {
    expect(pickOneVideoText(items, 'en')).toContain('you attached 3 (1. clipA.mp4, 2. clipB.mp4, 3. clipC.mp4)');
  });
});
