import { premiereMedia, premiereSpecSchema, premiereXml, timeline } from './premiereXml';

const spec = (over: Record<string, unknown> = {}) => premiereSpecSchema.parse({
  title: 'ჩემი ფილმი & co',
  clips: [
    { file: 'video/intro.mp4', durationSec: 4 },
    { file: 'video/body.mp4', durationSec: 10, inSec: 1, outSec: 9 },
    { file: 'video/intro.mp4', durationSec: 4, name: 'outro' },
  ],
  ...over,
});

describe('premiereXml', () => {
  it('places the clips back to back on the timeline in frames', () => {
    expect(timeline(spec())).toEqual([
      { start: 0, end: 120, in: 0, out: 120, srcFrames: 120 },
      { start: 120, end: 360, in: 30, out: 270, srcFrames: 300 },
      { start: 360, end: 480, in: 0, out: 120, srcFrames: 120 },
    ]);
  });

  it('writes one xmeml sequence with V1 and A1, escaped names and each file once', () => {
    const x = premiereXml(spec());
    expect(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4">')).toBe(true);
    expect(x).toContain('<name>ჩემი ფილმი &amp; co</name><duration>480</duration>');
    expect(x.match(/<clipitem id="clipitem-v/g)).toHaveLength(3);
    expect(x.match(/<clipitem id="clipitem-a/g)).toHaveLength(3);
    expect(x.match(/<file id="file-1">/g)).toHaveLength(1);
    expect(x).toContain('<file id="file-1"/>');
    expect(x).toContain('<pathurl>file://localhost/intro.mp4</pathurl>');
    expect(x).toContain('<start>120</start><end>360</end><in>30</in><out>270</out>');
    expect(premiereMedia(spec())).toEqual(['intro.mp4', 'body.mp4']);
  });

  it('lays a music bed on A2, cut to the film', () => {
    const x = premiereXml(spec({ music: { file: 'music/song.mp3', durationSec: 60 } }));
    expect(x).toContain('<clipitem id="clipitem-m1"><name>song.mp3</name>');
    expect(x).toMatch(/clipitem-m1.*<start>0<\/start><end>480<\/end><in>0<\/in><out>480<\/out>/);
    expect(x.match(/<track>/g)).toHaveLength(3);
  });

  it('refuses a spec it cannot place', () => {
    expect(premiereSpecSchema.safeParse({ title: 'x', clips: [] }).success).toBe(false);
    expect(premiereSpecSchema.safeParse({ title: 'x', clips: [{ file: 'a.mp4', durationSec: 5, inSec: 4, outSec: 2 }] }).success).toBe(false);
    expect(premiereSpecSchema.safeParse({ title: 'x', clips: [{ file: 'a.exe', durationSec: 5 }] }).success).toBe(false);
    expect(premiereSpecSchema.safeParse({ title: 'x', fps: 29, clips: [{ file: 'a.mp4', durationSec: 5 }] }).success).toBe(false);
  });
});
