/**
 * lib/video/storyboardNotice.ts — the chat line while a storyboard is being PLANNED (Phase 2 PR 6, GG's decision of
 * 2026-10-23).
 *
 * The old line was Georgian in every locale and announced "video generation started (3 scenes · 24 s) … Veo 2 …
 * ~5–10 minutes" the moment the plan call went out, with the scene count, the length and the wait all fixed. Nothing
 * was generating: the board opens for review first, and only its Generate starts a render (and the charge).
 *
 * This line says it is planning, with the scene count and the length of THIS board, in the user's language, and that
 * the render starts after the review. It gives no ETA (MASTER TASK v3.1 §3.3: no invented ETA). "Generation started"
 * is said by the render's own bubble, when a render starts.
 */
type Lang = 'ka' | 'en' | 'ru';
const lang = (l: string): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

function ruScenes(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? 'сцена' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'сцены' : 'сцен';
}

export function storyboardPlanningNotice(locale: string, scenes: number, seconds: number): string {
  const n = Math.max(1, Math.round(scenes));
  const s = Math.max(1, Math.round(seconds));
  switch (lang(locale)) {
    case 'en':
      return `🎬 **Planning the storyboard: ${n} ${n === 1 ? 'scene' : 'scenes'} · ${s} s**\n\nNo video is being made yet. You review the scenes first, and generation starts when you approve them.`;
    case 'ru':
      return `🎬 **Планирую раскадровку: ${n} ${ruScenes(n)} · ${s} с**\n\nВидео пока не создаётся. Сначала вы посмотрите сцены, а генерация начнётся, когда вы их подтвердите.`;
    default:
      return `🎬 **სტორიბორდს ვგეგმავ: ${n} სცენა · ${s} წმ**\n\nვიდეო ჯერ არ იქმნება. ჯერ სცენებს ნახავ, გენერაცია კი მათი დადასტურების შემდეგ დაიწყება.`;
  }
}
