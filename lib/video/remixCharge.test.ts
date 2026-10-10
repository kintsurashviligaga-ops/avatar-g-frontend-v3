/**
 * One list of charged remix ops for the route that charges and the chat that asks first. The chat's classifier names
 * (/api/video/remix-intent OPS) map onto the route's, and the route really reads this module (a copy would drift).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARGED_REMIX_OPS, canonicalRemixOp, isChargedRemixOp, remixAskText, remixOpCredits } from './remixCharge';
import { CREDIT_COSTS } from '@/lib/credits/pricing';

describe('remixCharge', () => {
  test('the chat classifier\'s op names map onto the route\'s', () => {
    expect(canonicalRemixOp('add_music')).toBe('music');
    expect(canonicalRemixOp('face_swap')).toBe('character');
    expect(canonicalRemixOp('add_subtitles')).toBe('captions');
    expect(canonicalRemixOp('trim')).toBe('trim');
  });

  test('every op the chat classifier can return is either charged (asks first) or a free ffmpeg op', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/video/remix-intent/route.ts'), 'utf8');
    const ops = JSON.parse(src.match(/const OPS = (\[[^\]]+\])/)![1]!.replace(/'/g, '"')) as string[];
    const charged = ops.filter(isChargedRemixOp).sort();
    expect(charged).toEqual(['add_music', 'background_remove', 'face_swap']);
    for (const op of ops.filter((o) => !isChargedRemixOp(o))) expect(['add_subtitles', 'color_grade', 'add_text_overlay', 'trim', 'speed_change', 'speed_ramp', 'stabilize']).toContain(op);
  });

  test('the route charges with this list, not a copy of it', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/video/remix/route.ts'), 'utf8');
    expect(route).toContain("from '@/lib/video/remixCharge'");
    expect(route).toMatch(/const CREDIT_CHARGED_OPS = CHARGED_REMIX_OPS;/);
    expect(route).not.toMatch(/(CREDIT_CHARGED_OPS|PAID_REMIX_OPS) = new Set/);
    expect(CHARGED_REMIX_OPS.has('productad')).toBe(true);
  });

  test('the price Agent G shows is the route\'s remix price', () => {
    expect(remixOpCredits()).toBe(CREDIT_COSTS.remix_video);
  });

  test('the question names the edit and the price in the user\'s language', () => {
    expect(remixAskText('face_swap', 15, 'ka')).toBe('ვიდეოს ეს რედაქტირება, „პერსონაჟის შეცვლა", 15 კრედიტი ღირს. დავიწყო?');
    expect(remixAskText('add_music', 15, 'en')).toBe('This edit of your video, „Music", costs 15 credits. Shall I start?');
    expect(remixAskText('background_remove', 15, 'ru')).toBe('Эта правка видео, «Удаление фона», стоит 15 кредитов. Начать?');
  });
});
