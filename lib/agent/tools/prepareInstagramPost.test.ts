import {
  assembleInstagramCaption,
  normalizeHashtag,
  prepareInstagramPost,
  IG_CAPTION_MAX,
  IG_HASHTAG_MAX,
} from './prepareInstagramPost';

describe('prepare_instagram_post — PREPARE-ONLY gate (STEP 3, pure)', () => {
  it('normalizes hashtags (strip #, keep letters/numbers/_, drop junk)', () => {
    expect(normalizeHashtag('#Sale')).toBe('#Sale');
    expect(normalizeHashtag('new day!')).toBe('#newday');
    expect(normalizeHashtag('###')).toBe('');
    expect(normalizeHashtag('ფასდაკლება')).toBe('#ფასდაკლება'); // unicode letters survive
  });

  it('dedupes (case-insensitive) and caps at IG_HASHTAG_MAX', () => {
    const many = Array.from({ length: 40 }, (_, i) => `tag${i}`);
    const { hashtags } = assembleInstagramCaption('hi', ['#Sale', 'sale', 'SALE', ...many]);
    expect(hashtags.length).toBeLessThanOrEqual(IG_HASHTAG_MAX);
    expect(hashtags.filter((t) => t.toLowerCase() === '#sale')).toHaveLength(1);
  });

  it('never exceeds the caption limit, dropping tags to fit', () => {
    const big = 'x'.repeat(IG_CAPTION_MAX - 5);
    const { caption } = assembleInstagramCaption(big, ['#onemore', '#another']);
    expect(caption.length).toBeLessThanOrEqual(IG_CAPTION_MAX);
  });

  it('ALWAYS returns requiresManualPost:true and posts nothing', () => {
    const out = prepareInstagramPost({ caption: 'ახალი დღე, ახალი ფასდაკლება', hashtags: ['sale'], mediaUrl: 'https://x.test/v.mp4' });
    expect(out.requiresManualPost).toBe(true);
    expect(out.mediaUrl).toBe('https://x.test/v.mp4');
    expect(out.copyPasteBlock).toContain('ახალი დღე');
    expect(out.instructions).toMatch(/never publishes/i);
  });
});
