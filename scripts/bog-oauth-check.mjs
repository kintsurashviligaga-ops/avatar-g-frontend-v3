#!/usr/bin/env node
/**
 * scripts/bog-oauth-check.mjs — "does Bank of Georgia accept this Client ID + Secret Key?", answered with ONE
 * OAuth token request. It creates no order, charges nothing and touches no database; BOG's token endpoint is the
 * same one our checkout calls first (lib/billing/bogClient), so a pass here means checkout's first step passes too.
 * One self-contained file (Node 18+, no packages): it can be downloaded alone and run from any folder.
 *
 *   node bog-oauth-check.mjs                   production (oauth2.bog.ge) — the OPAY pair from Business Manager
 *   BOG_ENV=sandbox node bog-oauth-check.mjs   sandbox (oauth2-sandbox.bog.ge) — a sandbox pair
 *
 * SECRET IN: run it with no variables and it asks for the pair in the terminal; the Secret Key is typed (or pasted)
 * blind — nothing is echoed, and it never lands in shell history, a chat or a log. (BOG_CLIENT_ID / BOG_SECRET_KEY
 * from the environment are used when both are set — for tests; typing a secret on a command line puts it in history.)
 * Ctrl+C at a prompt quits cleanly.
 *
 * SECRET OUT: it prints the verdict, BOG's HTTP status, the client id's last four characters (the admin BOG card shows
 * the same four, so the owner can tell which pair a deployment runs on) and, for a refusal, BOG's answer with every
 * form of the secret removed (verbatim, JSON-escaped, URL-encoded, base64 inside an echoed Basic header) and anything
 * shaped like a token masked. A token is never printed: on success nothing of BOG's answer is shown, and a 2xx answer
 * without a token shows only its field names.
 *
 * BOG_OAUTH_URL overrides the token URL for local tests only: anything but localhost is refused.
 * Exit code: 0 accepted, 1 refused / no answer, 2 usage.
 */
import readline from 'node:readline';
import { Writable } from 'node:stream';

export const OAUTH_HOSTS = {
  production: 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token',
  sandbox: 'https://oauth2-sandbox.bog.ge/auth/realms/bog/protocol/openid-connect/token',
};

export const HINTS = {
  ok: 'BOG იღებს ამ Client ID + Secret Key-ს. ეს წყვილი შეიძლება ჩაიწეროს Vercel-ში (BOG_CLIENT_ID / BOG_SECRET_KEY).',
  credentials_refused:
    'BOG-მა წყვილი არ მიიღო. ხელახლა დააკოპირე ორივე Business Manager-იდან (ზედმეტი ჰარის გარეშე). ' +
    'თუ ეს Sandbox-ის წყვილია, გაუშვი BOG_ENV=sandbox-ით; თუ Production-ის — BOG_ENV-ის გარეშე.',
  forbidden: 'BOG-მა წყვილი იცნო, მაგრამ წვდომა არ მისცა: Online Payments API ამ მერჩანტზე ჯერ არ არის ჩართული — ჰკითხე ბანკს.',
  endpoint_not_found: 'Token-ის მისამართმა 404 დააბრუნა — BOG-მა მისამართი შეცვალა (ან ტესტის BOG_OAUTH_URL არასწორია).',
  bog_error: 'BOG-მა სერვერის შეცდომა დააბრუნა. სცადე მოგვიანებით; თუ განმეორდა, აცნობე ბანკს.',
  no_answer: 'BOG-მა არ უპასუხა (ქსელი, DNS ან timeout). შეამოწმე ინტერნეტი და სცადე თავიდან.',
  malformed_answer: 'BOG-მა 2xx დააბრუნა access_token-ის გარეშე — აცნობე ბანკს (ქვემოთ მხოლოდ ველების სახელებია).',
};

class UsageError extends Error {}
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Which environment and token URL. A BOG_OAUTH_URL override may only point at this machine (tests). */
export function oauthTarget(env = process.env) {
  const environment = String(env.BOG_ENV || '').trim().toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
  const raw = String(env.BOG_OAUTH_URL || '').trim();
  if (!raw) return { environment, url: OAUTH_HOSTS[environment] };
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new UsageError('BOG_OAUTH_URL is not a URL.');
  }
  if (!LOOPBACK.has(u.hostname.toLowerCase())) {
    throw new UsageError('Refusing: BOG_OAUTH_URL may only point at this machine (tests). Unset it to ask BOG itself.');
  }
  return { environment, url: u.href };
}

/**
 * Remove every form a secret can come back in — verbatim, JSON-escaped, URL-encoded, base64 (an echoed Basic header) —
 * plus anything shaped like a token, then flatten whitespace.
 */
export function scrubSecrets(text, secrets) {
  let t = String(text);
  for (const s of secrets) {
    if (!s) continue;
    for (const form of new Set([s, JSON.stringify(s).slice(1, -1), encodeURIComponent(s), Buffer.from(s).toString('base64')])) {
      t = t.split(form).join('[redacted]');
    }
  }
  return t
    .replace(/"(access_token|refresh_token|id_token)"\s*:\s*"[^"]*"/g, '"$1":"[hidden]"')
    .replace(/eyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*/g, '[token]')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A 2xx answer without a token: its field names, never its values (one of them may be a token). */
export function describeKeys(text) {
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object' && !Array.isArray(j)) return `JSON keys: ${Object.keys(j).slice(0, 12).join(', ') || '(none)'}`;
    return `JSON ${Array.isArray(j) ? 'array' : typeof j}`;
  } catch {
    return `not JSON (${String(text).length} bytes)`;
  }
}

/** BOG's answer → verdict + what may be shown of it. */
export function classify(status, text, secrets) {
  if (status >= 200 && status < 300) {
    let token;
    try {
      token = JSON.parse(text).access_token;
    } catch {
      token = undefined;
    }
    return typeof token === 'string' && token ? { verdict: 'ok', answer: null } : { verdict: 'malformed_answer', answer: describeKeys(text) };
  }
  const verdict = status === 403 ? 'forbidden' : status === 404 ? 'endpoint_not_found' : status >= 500 ? 'bog_error' : 'credentials_refused';
  return { verdict, answer: text ? scrubSecrets(text, secrets).slice(0, 160) : null };
}

/** One terminal question. `hidden`: the prompt shows, the keystrokes do not (raw mode, muted echo). */
function ask(question, hidden) {
  return new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, encoding, done) {
        if (!muted) process.stdout.write(chunk, encoding);
        done();
      },
    });
    const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
    let answered = false;
    rl.on('SIGINT', () => {
      rl.close();
      process.stdout.write('\n');
      process.exit(130);
    });
    rl.on('close', () => {
      if (!answered) resolve('');
    });
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = hidden; // the prompt is already written; from here on nothing typed is echoed
  });
}

export async function main(env = process.env) {
  let target;
  try {
    target = oauthTarget(env);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  let id = String(env.BOG_CLIENT_ID || '').trim();
  let secret = String(env.BOG_SECRET_KEY || '').trim();
  if (!id || !secret) {
    if (!process.stdin.isTTY) {
      console.error('Run this in a terminal to type the pair in (or set BOG_CLIENT_ID and BOG_SECRET_KEY).');
      return 2;
    }
    console.log(`BOG ${target.environment} — ჩასვი Business Manager-იდან (Secret Key ეკრანზე არ გამოჩნდება):`);
    id = id || (await ask('  OPAY Client ID: ', false));
    secret = secret || (await ask('  OPAY Secret Key: ', true));
  }
  if (!id || !secret) {
    console.error('Client ID and Secret Key are both required.');
    return 2;
  }
  const secrets = [secret, `${id}:${secret}`];

  const started = Date.now();
  let verdict = 'no_answer';
  let status = 0;
  let answer = null;
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
    ({ verdict, answer } = classify(status, await res.text().catch(() => ''), secrets));
  } catch {
    verdict = 'no_answer';
  }

  const mark = verdict === 'ok' ? '✓' : '✗';
  console.log(`${mark} ${verdict} · HTTP ${status || '—'} · ${target.environment} · client …${id.slice(-4)} · ${Date.now() - started} ms`);
  if (answer) console.log(`  BOG: ${answer}`);
  if (verdict !== 'ok' && (/\s/.test(id) || /\s/.test(secret))) {
    console.log('  შენიშვნა: ჩასმულ მნიშვნელობაში შუაში ჰარი ან ახალი ხაზი ერია — ხელახლა დააკოპირე.');
  }
  console.log(`  ${HINTS[verdict]}`);
  return verdict === 'ok' ? 0 : 1;
}

if (/bog-oauth-check[^/\\]*\.mjs$/i.test(process.argv[1] || '')) {
  main().then((code) => process.exit(code));
}
