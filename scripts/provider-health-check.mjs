#!/usr/bin/env node

const boolArg = process.argv.includes('--live');
const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const url = `${baseUrl.replace(/\/+$/, '')}/api/app/health${boolArg ? '?live=1' : ''}`;

const run = async () => {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    console.error(`[health-check] failed (${response.status})`, payload);
    process.exit(1);
  }

  console.log(`\n[provider-health] live=${payload.live} timestamp=${payload.timestamp}`);
  console.log('\nRouting audit:');
  for (const row of payload.audit.routing || []) {
    const status = row.configured ? 'configured' : 'missing-key';
    console.log(` - ${row.category.padEnd(6)} -> ${row.provider.padEnd(9)} (${row.envKey}) ${status}`);
  }

  console.log('\nProvider probes:');
  let failed = false;
  for (const row of payload.audit.providers || []) {
    const credits = typeof row.creditsRemaining === 'number' ? ` credits=${row.creditsRemaining}` : '';
    console.log(` - ${row.provider.padEnd(9)} ${row.status.padEnd(11)} ${row.detail}${credits}`);
    if (row.status === 'unhealthy' || row.status === 'missing_key') {
      failed = true;
    }
  }

  console.log('');
  process.exit(failed ? 2 : 0);
};

run().catch((error) => {
  console.error('[health-check] error', error);
  process.exit(1);
});
