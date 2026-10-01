/**
 * artifactStore: open/close, the artifact on screen, versions per artifact id, the landing tab and the host count.
 *
 * ⚠️ WHAT THESE PIN.
 *  - The same code opened twice is never a second version: an older bubble's block re-selects the version it is.
 *  - New code under the same id (language + title) is the next version, and the switcher can step back to v1.
 *  - Preview exists only for html / svg — a python artifact can never be left on a Preview tab.
 *  - Bounded: MAX_VERSIONS per id, MAX_ARTIFACTS ids, least recently opened evicted.
 *  - The host count never goes negative (a double cleanup under StrictMode).
 */
import { MAX_ARTIFACTS, MAX_VERSIONS, resetArtifactStore, selectCurrentVersions, useArtifactStore } from './artifactStore';

const store = () => useArtifactStore.getState();

beforeEach(() => resetArtifactStore());

describe('open / close', () => {
  it('starts closed and empty', () => {
    expect(store().open).toBe(false);
    expect(store().current).toBeNull();
    expect(selectCurrentVersions(store())).toEqual([]);
  });

  it('opens a validated artifact as {id, title, language, code}', () => {
    const shown = store().openArtifact({ language: 'py', code: 'print(1)' });
    expect(shown).toEqual({ id: 'python:python', title: 'Python', language: 'python', code: 'print(1)' });
    expect(store().open).toBe(true);
    expect(store().current).toEqual(shown);
    expect(store().tab).toBe('code');
  });

  it('refuses invalid input and changes nothing', () => {
    expect(store().openArtifact({ language: 'mermaid', code: 'graph TD' })).toBeNull();
    expect(store().openArtifact({ language: 'html', code: '' })).toBeNull();
    expect(store().open).toBe(false);
    expect(store().current).toBeNull();
  });

  it('close keeps the artifact (the exit animation still has something to draw)', () => {
    store().openArtifact({ language: 'html', code: '<p>a</p>' });
    store().close();
    expect(store().open).toBe(false);
    expect(store().current?.code).toBe('<p>a</p>');
  });
});

describe('tabs', () => {
  it('html and svg land on Preview by default, and can be asked to land on Code', () => {
    store().openArtifact({ language: 'html', code: '<p>a</p>' });
    expect(store().tab).toBe('preview');
    store().openArtifact({ language: 'svg', code: '<svg/>' }, { tab: 'code' });
    expect(store().tab).toBe('code');
  });

  it('a non-previewable artifact is always on Code, whatever is asked', () => {
    store().openArtifact({ language: 'python', code: 'pass' }, { tab: 'preview' });
    expect(store().tab).toBe('code');
    store().setTab('preview');
    expect(store().tab).toBe('code');
  });
});

describe('versions', () => {
  it('new code under the same id is the next version; selectVersion steps back', () => {
    store().openArtifact({ title: 'Todo', language: 'html', code: '<p>v1</p>' });
    store().openArtifact({ title: 'todo', language: 'html', code: '<p>v2</p>' }); // case-folded: same id
    expect(store().current).toMatchObject({ id: 'html:todo', code: '<p>v2</p>' });
    expect(store().versionIndex).toBe(1);
    expect(selectCurrentVersions(store()).map((v) => v.code)).toEqual(['<p>v1</p>', '<p>v2</p>']);

    store().selectVersion(0);
    expect(store().current?.code).toBe('<p>v1</p>');
    store().selectVersion(99); // clamped
    expect(store().versionIndex).toBe(1);
    store().selectVersion(-5);
    expect(store().versionIndex).toBe(0);
  });

  it('opening code that is already a version re-selects it instead of appending a duplicate', () => {
    store().openArtifact({ title: 'Todo', language: 'html', code: '<p>v1</p>' });
    store().openArtifact({ title: 'Todo', language: 'html', code: '<p>v2</p>' });
    store().openArtifact({ title: 'Todo', language: 'html', code: '<p>v1</p>' });
    expect(selectCurrentVersions(store())).toHaveLength(2);
    expect(store().versionIndex).toBe(0);
    expect(store().current?.code).toBe('<p>v1</p>');
  });

  it('a different title or language is a different artifact', () => {
    store().openArtifact({ title: 'A', language: 'html', code: '<p>1</p>' });
    store().openArtifact({ title: 'B', language: 'html', code: '<p>2</p>' });
    store().openArtifact({ title: 'A', language: 'css', code: 'p{}' });
    expect(Object.keys(store().versions).sort()).toEqual(['css:a', 'html:a', 'html:b']);
  });

  it('a producer-supplied id groups versions regardless of title', () => {
    store().openArtifact({ id: 'live:clock', title: 'Clock v1', language: 'html', code: '<p>1</p>' });
    store().openArtifact({ id: 'live:clock', title: 'Clock v2', language: 'html', code: '<p>2</p>' });
    expect(selectCurrentVersions(store()).map((v) => v.title)).toEqual(['Clock v1', 'Clock v2']);
    // An id that is not a short plain token is ignored, never trusted as a key.
    store().openArtifact({ id: '<script>', title: 'X', language: 'html', code: '<p>3</p>' });
    expect(store().current?.id).toBe('html:x');
  });

  it('keeps at most MAX_VERSIONS per artifact, dropping the oldest', () => {
    for (let i = 0; i < MAX_VERSIONS + 3; i++) store().openArtifact({ title: 'T', language: 'text', code: `v${i}` });
    const list = selectCurrentVersions(store());
    expect(list).toHaveLength(MAX_VERSIONS);
    expect(list[0]!.code).toBe('v3');
    expect(store().versionIndex).toBe(MAX_VERSIONS - 1);
  });

  it('keeps at most MAX_ARTIFACTS ids, evicting the least recently opened', () => {
    for (let i = 0; i < MAX_ARTIFACTS + 2; i++) store().openArtifact({ title: `T${i}`, language: 'text', code: `c${i}` });
    expect(Object.keys(store().versions)).toHaveLength(MAX_ARTIFACTS);
    expect(store().versions['text:t0']).toBeUndefined();
    expect(store().versions['text:t1']).toBeUndefined();
    expect(store().current?.id).toBe(`text:t${MAX_ARTIFACTS + 1}`);
  });
});

describe('hosts', () => {
  it('counts mounted canvases and never goes below zero on a double cleanup', () => {
    const a = store().registerHost();
    const b = store().registerHost();
    expect(store().hosts).toBe(2);
    a();
    a();
    expect(store().hosts).toBe(1);
    b();
    expect(store().hosts).toBe(0);
  });
});
