/* eslint-disable no-console */

type Config = {
  baseUrl: string;
  requests: number;
  concurrency: number;
  endpoint: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
};

function parseArgs(): Config {
  const args = new Map<string, string>();
  for (const token of process.argv.slice(2)) {
    const [key, value] = token.split('=');
    if (key?.startsWith('--') && value) {
      args.set(key.slice(2), value);
    }
  }

  return {
    baseUrl: args.get('baseUrl') ?? process.env.LOAD_TEST_BASE_URL ?? 'http://localhost:3000',
    requests: Number(args.get('requests') ?? '60'),
    concurrency: Number(args.get('concurrency') ?? '10'),
    endpoint: args.get('endpoint') ?? '/api/observability/latency',
    method: ((args.get('method') ?? 'GET').toUpperCase() as 'GET' | 'POST'),
    body: args.get('body') ? JSON.parse(args.get('body') as string) : undefined,
  };
}

async function run() {
  const cfg = parseArgs();
  const target = `${cfg.baseUrl}${cfg.endpoint}`;
  const durations: number[] = [];
  let success = 0;
  let failed = 0;

  const workers = Array.from({ length: cfg.concurrency }).map(async (_, workerIndex) => {
    for (let i = workerIndex; i < cfg.requests; i += cfg.concurrency) {
      const started = Date.now();
      try {
        const res = await fetch(target, {
          method: cfg.method,
          headers: cfg.body ? { 'Content-Type': 'application/json' } : undefined,
          body: cfg.body ? JSON.stringify(cfg.body) : undefined,
        });
        const duration = Date.now() - started;
        durations.push(duration);

        if (res.ok) success += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
  });

  await Promise.all(workers);
  const sorted = durations.sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;

  console.log(
    JSON.stringify(
      {
        target,
        total_requests: cfg.requests,
        concurrency: cfg.concurrency,
        success,
        failed,
        p50_ms: p50,
        p95_ms: p95,
      },
      null,
      2
    )
  );

  process.exit(failed > 0 ? 1 : 0);
}

void run();
