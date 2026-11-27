import fs from 'fs';
import path from 'path';
import { LAUNCH_FLAGS, checkLaunchFlags, flagIsOn, launchFlag, launchFlagStatus, acceptedValues } from './launchFlags';
import { renderEnvRegistry } from './launchFlagsDoc';

const f = (name: string) => launchFlag(name)!;

describe('launch flag vocabularies', () => {
  it('admin|everyone flags treat 1, true and admins as OFF', () => {
    for (const v of ['1', 'true', 'on', 'all', 'admins']) expect(flagIsOn(f('STUDIO_3D_V2'), v)).toBe(false);
    expect(flagIsOn(f('STUDIO_3D_V2'), ' Admin ')).toBe(true);
    expect(flagIsOn(f('MONTAGE_SMART_EDITOR'), 'everyone')).toBe(true);
  });
  it('AGENT_REEL_TASK needs admins with the s', () => {
    expect(flagIsOn(f('AGENT_REEL_TASK'), 'admin')).toBe(false);
    expect(flagIsOn(f('AGENT_REEL_TASK'), 'admins')).toBe(true);
  });
  it('exact flags do not trim or lower-case', () => {
    expect(flagIsOn(f('BROWSER_ENABLED'), '1')).toBe(true);
    expect(flagIsOn(f('BROWSER_ENABLED'), 'true')).toBe(false);
    expect(flagIsOn(f('NEXT_PUBLIC_PRICING_V8'), 'TRUE')).toBe(false);
    expect(flagIsOn(f('NEXT_PUBLIC_PRICING_V8'), 'on')).toBe(true);
  });
  it('every name is unique and every twin points back', () => {
    const names = LAUNCH_FLAGS.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
    for (const x of LAUNCH_FLAGS) if (x.twin) expect(launchFlag(x.twin)?.twin).toBe(x.name);
  });
  it('every NEXT_PUBLIC_ entry is client-side and no secret is NEXT_PUBLIC_', () => {
    for (const x of LAUNCH_FLAGS) {
      expect(x.side === 'client').toBe(x.name.startsWith('NEXT_PUBLIC_'));
      if (x.secret) expect(x.name.startsWith('NEXT_PUBLIC_')).toBe(false);
    }
  });
});

describe('checkLaunchFlags', () => {
  it('is silent for an unset or plainly-off environment', () => {
    expect(checkLaunchFlags({})).toEqual([]);
    expect(checkLaunchFlags({ STUDIO_3D_V2: '', AGENT_PLUGINS: '0', CONNECTORS_GITHUB: 'off' })).toEqual([]);
  });
  it('names a value the reader ignores, with what it accepts', () => {
    const w = checkLaunchFlags({ STUDIO_3D_V2: 'true', NEXT_PUBLIC_STUDIO_3D_V2: 'true' });
    expect(w.map((x) => x.kind)).toEqual(['ignored_value', 'ignored_value']);
    expect(w[0]!.message).toContain('admin | everyone');
  });
  it('names a misspelt flag', () => {
    const w = checkLaunchFlags({ STUDIO3D_V2: 'admin' });
    expect(w).toEqual([expect.objectContaining({ kind: 'misspelt_name', name: 'STUDIO3D_V2' })]);
  });
  it('names a server flag without its NEXT_PUBLIC_ twin, and the reverse', () => {
    expect(checkLaunchFlags({ MONTAGE_SMART_EDITOR: 'admin' })).toEqual([expect.objectContaining({ kind: 'missing_twin' })]);
    expect(checkLaunchFlags({ NEXT_PUBLIC_AGENT_PLUGINS: '1' })).toEqual([expect.objectContaining({ kind: 'twin_mismatch' })]);
    expect(checkLaunchFlags({ AGENT_PLUGINS: 'admin', NEXT_PUBLIC_AGENT_PLUGINS: '1' })).toEqual([]);
  });
  it('a padded exact flag is a warning even when it says 1', () => {
    expect(checkLaunchFlags({ BROWSER_ENABLED: ' 1' })).toEqual([expect.objectContaining({ kind: 'ignored_value' })]);
  });
});

describe('launchFlagStatus', () => {
  it('never returns a secret value', () => {
    const rows = launchFlagStatus({ AGENT_BROWSER_VAULT_KEY: 'super-secret', CONNECTOR_TOKEN_KEY: 'k' });
    const vault = rows.find((r) => r.name === 'AGENT_BROWSER_VAULT_KEY')!;
    expect(vault).toMatchObject({ set: true, on: true, value: undefined });
    expect(JSON.stringify(rows)).not.toContain('super-secret');
  });
  it('reports on/off as the reader sees it', () => {
    const rows = launchFlagStatus({ STUDIO_3D_V2: '1' });
    expect(rows.find((r) => r.name === 'STUDIO_3D_V2')).toMatchObject({ set: true, on: false, accepts: acceptedValues(f('STUDIO_3D_V2')) });
  });
});

describe('docs and .env.example', () => {
  const root = path.join(__dirname, '..', '..');
  it('docs/launch/ENV_REGISTRY.md is the generated registry (WRITE_ENV_REGISTRY=1 to refresh)', () => {
    const file = path.join(root, 'docs/launch/ENV_REGISTRY.md');
    const want = renderEnvRegistry();
    if (process.env.WRITE_ENV_REGISTRY === '1') fs.writeFileSync(file, want);
    expect(fs.readFileSync(file, 'utf8')).toBe(want);
  });
  // These lines arrive with their own drafts (#392 plugins + connectors, #371 safety identifier).
  const ADDED_BY_DRAFTS = new Set(['AGENT_PLUGINS', 'NEXT_PUBLIC_AGENT_PLUGINS', 'CONNECTORS_NOTION', 'CONNECTORS_GITHUB', 'NOTION_OAUTH_CLIENT_ID', 'NOTION_OAUTH_CLIENT_SECRET', 'GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET', 'SAFETY_IDENTIFIER',
    // #403 / #404 add their own .env.example lines; listing them here too would duplicate them after the merge.
    'AI_PROVENANCE_META', 'NEXT_PUBLIC_AI_LABELS']);
  it('.env.example names every launch switch', () => {
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    const missing = LAUNCH_FLAGS.filter((x) => !ADDED_BY_DRAFTS.has(x.name) && !new RegExp(`^#?\\s*${x.name}=`, 'm').test(example)).map((x) => x.name);
    expect(missing).toEqual([]);
  });
});
