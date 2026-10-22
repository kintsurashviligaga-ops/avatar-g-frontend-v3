import { classifyAgentIntent } from './intent';
import type { AttachmentKind } from './contracts';

describe('uploaded footage is retained when a montage ask names a video', () => {
  test.each([
    'Make a music video from these three clips',
    'Combine these videos with this soundtrack',
    'Смонтируй эти видео под музыку',
  ])('%s keeps the clips, still and track in the montage', (text) => {
    expect(classifyAgentIntent({ text, attachments: ['video', 'image', 'video', 'audio'] }))
      .toMatchObject({ kind: 'act', capability: 'agent.montage', target: 'attachment', missing: [] });
  });

  test('clips joined under their own sound do not ask for an unnecessary track', () => {
    expect(classifyAgentIntent({ text: 'Combine these videos without music', attachments: ['video', 'video'] }))
      .toMatchObject({ kind: 'act', capability: 'agent.montage', target: 'attachment', missing: [] });
  });

  test.each<AttachmentKind[]>([
    ['image', 'audio'],
    ['image', 'image', 'audio'],
  ])('photos and an attached soundtrack for a new actor video stay references: %j', (...attachments) => {
    expect(classifyAgentIntent({ text: 'Make a video of an actor using these reference photos', attachments }))
      .toMatchObject({ kind: 'act', capability: 'video.generate', target: 'attachment' });
  });

  test('adding music to one whole video remains a remix, not a cut into shots', () => {
    expect(classifyAgentIntent({ text: 'Add music to this video', attachments: ['video', 'audio'] }))
      .toMatchObject({ kind: 'act', capability: 'video.remix', target: 'attachment' });
  });
});
