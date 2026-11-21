/**
 * lib/env/launchFlagsDoc.ts — renders docs/launch/ENV_REGISTRY.md from LAUNCH_FLAGS (the test keeps them equal;
 * `WRITE_ENV_REGISTRY=1 npx jest lib/env/launchFlags.test.ts` rewrites the file).
 */
import { LAUNCH_FLAGS, acceptedValues } from './launchFlags';

const cell = (s: string) => s.replace(/\|/g, '\\|');

export function renderEnvRegistry(): string {
  const lines: string[] = [
    '# Launch env registry (generated)',
    '',
    '_Generated from `lib/env/launchFlags.ts`. Do not edit by hand: run `WRITE_ENV_REGISTRY=1 npx jest lib/env/launchFlags.test.ts`._',
    '',
    'Set each name **exactly** as written. The values a flag accepts differ between features. A value outside the',
    '"Turns ON with" list leaves the feature OFF without any error. After a change in Vercel, open',
    '`/api/admin/launch-flags` (admins only) to see how the code reads every switch.',
    '',
    '`NEXT_PUBLIC_` names are baked in at build time, so a change needs a redeploy.',
    '',
  ];
  const features = [...new Set(LAUNCH_FLAGS.map((f) => f.feature))];
  for (const feature of features) {
    lines.push(`## ${feature}`, '', '| Name | Side | Turns ON with | Where | Note |', '|---|---|---|---|---|');
    for (const f of LAUNCH_FLAGS.filter((x) => x.feature === feature)) {
      const on = f.vocab === 'value' ? (f.secret ? 'a value (secret)' : 'a value') : `\`${acceptedValues(f).split(' | ').join('` `')}\`${f.exact ? ' (exact)' : ''}`;
      const note = [f.twin ? `Pair: \`${f.twin}\`.` : '', f.note ?? ''].filter(Boolean).join(' ');
      lines.push(`| \`${f.name}\` | ${f.side} | ${cell(on)} | ${cell(f.where)} | ${cell(note)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
