/** @jest-environment node */
import { memoryBlobs, workspaceStore } from './store';
import { workspaceAction } from './actions';

const U = '11111111-2222-3333-4444-555555555555';

describe('workspace premiere_xml', () => {
  it('writes the montage spec as a Premiere project next to it and names the media to keep with it', async () => {
    const store = workspaceStore(memoryBlobs());
    const w = await store.ensure(U, 'Agent G');
    if (!w.ok) throw new Error(w.message);
    const ws = w.workspace.id;
    const spec = { title: 'რეკლამა', clips: [{ file: 'video/a.mp4', durationSec: 8 }, { file: 'video/b.mp4', durationSec: 6, outSec: 5 }], music: { file: 'music/m.mp3', durationSec: 30 } };
    await store.write(U, ws, 'montage/ad.json', Buffer.from(JSON.stringify(spec)), 'agent');
    const r = await workspaceAction(store, null, U, { action: 'premiere_xml', workspaceId: ws, path: 'montage/ad.json' }, 'agent');
    expect(r).toMatchObject({ status: 200, body: { ok: true, file: { path: 'montage/ad.xml' }, media: ['a.mp4', 'b.mp4', 'm.mp3'] } });
    const xml = await workspaceAction(store, null, U, { action: 'read', workspaceId: ws, path: 'montage/ad.xml' });
    expect(String((xml.body as { text?: string }).text)).toContain('<xmeml version="4"><sequence id="sequence-1"><name>რეკლამა</name><duration>390</duration>');
  });

  it('refuses what is not a montage spec, and an out that is not .xml', async () => {
    const store = workspaceStore(memoryBlobs());
    const w = await store.ensure(U, 'Agent G');
    if (!w.ok) throw new Error(w.message);
    const ws = w.workspace.id;
    await store.write(U, ws, 'bad.json', Buffer.from('{"title":"x","clips":[]}'), 'agent');
    expect(await workspaceAction(store, null, U, { action: 'premiere_xml', workspaceId: ws, path: 'bad.json' })).toMatchObject({ status: 400, body: { message: expect.stringContaining('not a montage spec') } });
    expect(await workspaceAction(store, null, U, { action: 'premiere_xml', workspaceId: ws, path: 'bad.json', out: 'x.txt' })).toMatchObject({ status: 400 });
    expect(await workspaceAction(store, null, U, { action: 'premiere_xml', workspaceId: ws, path: 'notes.txt' })).toMatchObject({ status: 400 });
  });
});
