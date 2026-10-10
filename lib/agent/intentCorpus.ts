/**
 * lib/agent/intentCorpus.ts — labelled messages for Agent G's intent reading, ka · en · ru, with the context each was
 * said in (attachments, the tool open, a plan on screen, the last result). The label is what Agent G SHOULD do.
 *
 * Two uses. lib/agent/intentCorpus.test.ts holds the deterministic router (lib/agent/intent) to every label. And it is
 * the fixed set a model router (Gemini function calling over lib/agent/tools/declarations) is scored against before it
 * may take over any lane: same messages, same labels, accuracy and latency side by side (PART 7; the live calls are
 * paid and wait for the owner's word).
 */
import type { AttachmentKind, CapabilityId, ControlOp } from './contracts';

export interface CorpusCase {
  text: string;
  attachments?: AttachmentKind[];
  mode?: string;
  previous?: { kind: 'video' | 'image' | 'audio' };
  pending?: { capability: CapabilityId };
  expect:
    | { kind: 'control'; op: ControlOp }
    | { kind: 'talk' | 'question' | 'feedback' | 'chat' }
    | { kind: 'act'; capability: CapabilityId; missing?: string[] }
    | { kind: 'unavailable'; capability: CapabilityId };
  /** Where the case comes from: the Master Task's 13 sentences, a production report, or coverage. */
  source: 'master-task' | 'report' | 'coverage';
}

const V3: AttachmentKind[] = ['video', 'video', 'video'];

export const INTENT_CORPUS: readonly CorpusCase[] = [
  // ── The Master Task's 13 sentences ────────────────────────────────────────────────────────────────────────────
  { text: 'ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე.', attachments: [...V3, 'audio'], expect: { kind: 'act', capability: 'agent.montage' }, source: 'master-task' },
  { text: 'ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე.', attachments: V3, expect: { kind: 'act', capability: 'agent.montage', missing: ['track'] }, source: 'master-task' },
  { text: 'ამ ვიდეოდან ამოიღე ხმა MP3-ად.', attachments: ['video'], expect: { kind: 'act', capability: 'agent.audio-extract' }, source: 'master-task' },
  { text: 'მუსიკა 5 წამიდან დაიწყე.', pending: { capability: 'agent.montage' }, expect: { kind: 'act', capability: 'agent.montage' }, source: 'master-task' },
  { text: 'ვიდეო 9:16-ზე გადაიყვანე.', attachments: ['video'], expect: { kind: 'act', capability: 'media.edit' }, source: 'master-task' },
  // An ad is the Product ad service: it is made from the product's photo, so with none attached Agent G asks for it.
  { text: 'გააკეთე 20-წამიანი რეკლამა.', expect: { kind: 'act', capability: 'video.product-ad', missing: ['photo'] }, source: 'master-task' },
  { text: 'გააკეთე 20-წამიანი რეკლამა.', attachments: ['image'], expect: { kind: 'act', capability: 'video.product-ad' }, source: 'master-task' },
  { text: 'ეს ფოტო გააცოცხლე.', attachments: ['image'], expect: { kind: 'act', capability: 'video.generate' }, source: 'master-task' },
  { text: 'სუბტიტრები დაამატე.', attachments: ['video'], expect: { kind: 'act', capability: 'video.remix' }, source: 'master-task' },
  { text: 'ეს ვიდეო რუსულად გაახმოვანე.', attachments: ['video'], expect: { kind: 'act', capability: 'voice.dubbing' }, source: 'master-task' },
  { text: 'წინა შედეგს ფერები შეუცვალე.', previous: { kind: 'video' }, expect: { kind: 'act', capability: 'video.remix' }, source: 'master-task' },
  { text: 'იგივე პერსონაჟით შემდეგი სცენა გააკეთე.', previous: { kind: 'video' }, expect: { kind: 'act', capability: 'video.generate' }, source: 'master-task' },
  { text: 'სამუშაო შეწყვიტე.', expect: { kind: 'control', op: 'stop' }, source: 'master-task' },
  { text: 'სადამდე მიხვედი?', expect: { kind: 'control', op: 'status' }, source: 'master-task' },
  { text: 'შენი წინა ნაბიჯიდან გააგრძელე.', expect: { kind: 'control', op: 'continue' }, source: 'master-task' },

  // ── The same in English and Russian ───────────────────────────────────────────────────────────────────────────
  { text: 'make a music video from these three clips', attachments: [...V3, 'audio'], expect: { kind: 'act', capability: 'agent.montage' }, source: 'coverage' },
  { text: 'extract the audio from this video as an MP3', attachments: ['video'], expect: { kind: 'act', capability: 'agent.audio-extract' }, source: 'coverage' },
  { text: 'start the music at 5 seconds', pending: { capability: 'agent.montage' }, expect: { kind: 'act', capability: 'agent.montage' }, source: 'coverage' },
  { text: 'stop the work', expect: { kind: 'control', op: 'stop' }, source: 'coverage' },
  { text: 'how far along are you?', expect: { kind: 'control', op: 'status' }, source: 'coverage' },
  { text: 'continue from your last step', expect: { kind: 'control', op: 'continue' }, source: 'coverage' },
  { text: 'сделай клип из этих трёх видео под музыку', attachments: [...V3, 'audio'], expect: { kind: 'act', capability: 'agent.montage' }, source: 'coverage' },
  { text: 'вытащи звук из этого видео в mp3', attachments: ['video'], expect: { kind: 'act', capability: 'agent.audio-extract' }, source: 'coverage' },
  { text: 'останови работу', expect: { kind: 'control', op: 'stop' }, source: 'coverage' },
  { text: 'на каком ты этапе?', expect: { kind: 'control', op: 'status' }, source: 'coverage' },
  { text: 'продолжи с предыдущего шага', expect: { kind: 'control', op: 'continue' }, source: 'coverage' },
  { text: 'добавь субтитры', attachments: ['video'], expect: { kind: 'act', capability: 'video.remix' }, source: 'coverage' },

  // ── Words that must never spend (production reports) ──────────────────────────────────────────────────────────
  { text: 'აქ ხარ?', mode: 'image', expect: { kind: 'talk' }, source: 'report' },
  { text: 'გამარჯობა', mode: 'video', expect: { kind: 'talk' }, source: 'report' },
  { text: 'მადლობა', mode: 'music', expect: { kind: 'talk' }, source: 'report' },
  { text: 'რა ღირს ვიდეო?', mode: 'video', expect: { kind: 'question' }, source: 'report' },
  { text: 'how much does a song cost?', expect: { kind: 'question' }, source: 'coverage' },
  { text: 'сколько стоит видео?', expect: { kind: 'question' }, source: 'coverage' },
  { text: 'არ მომწონს', mode: 'image', expect: { kind: 'feedback' }, source: 'coverage' },
  { text: "I don't like it", expect: { kind: 'feedback' }, source: 'coverage' },
  { text: 'не нравится', expect: { kind: 'feedback' }, source: 'coverage' },

  // ── Requests the existing doors already take ──────────────────────────────────────────────────────────────────
  { text: 'დამიხატე კატა', expect: { kind: 'act', capability: 'image.generate' }, source: 'coverage' },
  { text: 'draw a cat in watercolor', expect: { kind: 'act', capability: 'image.generate' }, source: 'coverage' },
  { text: 'make a song about the sea', expect: { kind: 'act', capability: 'music.generate' }, source: 'coverage' },
  { text: 'сгенерируй видео с котом на пляже', expect: { kind: 'act', capability: 'video.generate' }, source: 'coverage' },
  { text: 'dub this video into Russian', attachments: ['video'], expect: { kind: 'act', capability: 'voice.dubbing' }, source: 'coverage' },
  { text: 'ამ ვიდეოს სუბტიტრები დაუმატე', attachments: ['video'], expect: { kind: 'act', capability: 'video.remix' }, source: 'coverage' },

  // ── Missing inputs: Agent G asks, nothing runs ────────────────────────────────────────────────────────────────
  { text: 'ამ ვიდეოდან ამოიღე ხმა MP3-ად.', expect: { kind: 'act', capability: 'agent.audio-extract', missing: ['source'] }, source: 'coverage' },
  { text: 'ეს ფოტო გააცოცხლე.', expect: { kind: 'act', capability: 'video.generate', missing: ['photo'] }, source: 'coverage' },
  { text: 'სუბტიტრები დაამატე.', expect: { kind: 'act', capability: 'video.remix', missing: ['video'] }, source: 'coverage' },
  { text: 'make a music video from these three clips', expect: { kind: 'act', capability: 'agent.montage', missing: ['clips', 'track'] }, source: 'coverage' },

  // ── Plain conversation ────────────────────────────────────────────────────────────────────────────────────────
  { text: 'tell me a story about a dragon', expect: { kind: 'chat' }, source: 'coverage' },
  { text: 'დაწერე ლექსი შემოდგომაზე', expect: { kind: 'chat' }, source: 'coverage' },
];
