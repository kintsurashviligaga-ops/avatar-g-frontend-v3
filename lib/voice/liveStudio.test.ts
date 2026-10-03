/** @jest-environment node */
import { aspectForOrientation, matchStyle, snapMusicSeconds, videoOrientationFor } from './liveStudio';

const IMG = ['Auto', 'Photorealistic', 'Cinematic', 'Digital Art', 'Anime', '3D Render', 'Oil Painting', 'Watercolor'];
const VID = ['Cinematic', 'Documentary', 'Anime', 'Horror', 'Romantic'];

describe('liveStudio — a spoken setting lands on a real control', () => {
  it('frame shapes → the video panel\'s four orientations, and back', () => {
    expect(videoOrientationFor('9:16')).toBe('vertical');
    expect(videoOrientationFor('16:9')).toBe('landscape');
    expect(videoOrientationFor('4:3')).toBe('landscape');
    expect(videoOrientationFor('1:1')).toBe('square');
    expect(videoOrientationFor('3:4')).toBe('portrait');
    expect(videoOrientationFor('21:9')).toBeNull();
    expect(aspectForOrientation('vertical')).toBe('9:16');
    expect(aspectForOrientation('portrait')).toBe('4:5');
  });

  it('music length snaps to 15/30/60/90 s; past that it is the full song', () => {
    expect(snapMusicSeconds(10)).toBe(15);
    expect(snapMusicSeconds(27)).toBe(30);
    expect(snapMusicSeconds(45)).toBe(30);
    expect(snapMusicSeconds(80)).toBe(90);
    expect(snapMusicSeconds(180)).toBe(0);
    expect(snapMusicSeconds(Number.NaN)).toBe(30);
  });

  it('a style matches the panel\'s list in any case, by synonym (ka/ru/en) or by a contained word — or not at all', () => {
    expect(matchStyle('watercolor', IMG)).toBe('Watercolor');
    expect(matchStyle('ANIME', IMG)).toBe('Anime');
    expect(matchStyle('realistic', IMG)).toBe('Photorealistic');
    expect(matchStyle('აკვარელი', IMG)).toBe('Watercolor');
    expect(matchStyle('кино', VID)).toBe('Cinematic');
    expect(matchStyle('digital', IMG)).toBe('Digital Art');
    expect(matchStyle('documentary', VID)).toBe('Documentary');
    expect(matchStyle('vaporwave', IMG)).toBeNull();
    expect(matchStyle('auto', ['Auto'])).toBe('Auto');
    expect(matchStyle('   ', IMG)).toBeNull();
  });
});
