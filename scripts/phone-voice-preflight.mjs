#!/usr/bin/env node

/**
 * Read-only preflight for the DIDWW/SIP voice path.
 * It never prints secret values and never changes Vercel, DIDWW or the database.
 * Default mode is an informational preparation check; --strict is the release gate.
 */

const strict = process.argv.includes('--strict');
const checkHealth = strict || process.argv.includes('--check-health');

const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
const present = (key) => Boolean(String(process.env[key] ?? '').trim());
const failures = [];
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(name);
}

check('voice_provider', String(process.env.PHONE_VOICE_PROVIDER ?? '').trim().toLowerCase() === 'didww', 'PHONE_VOICE_PROVIDER=didww');
for (const key of [
  'DIDWW_API_KEY',
  'DIDWW_SIP_USERNAME',
  'DIDWW_SIP_PASSWORD',
  'DIDWW_SIP_DID',
  'PHONE_BRIDGE_URL',
  'PHONE_BRIDGE_SHARED_SECRET',
]) {
  check(`present:${key}`, present(key), `${key} is present (value withheld)`);
}

let bridgeUrl;
try {
  bridgeUrl = new URL(String(process.env.PHONE_BRIDGE_URL ?? '').trim());
  check('bridge_url_scheme', bridgeUrl.protocol === 'https:', 'PHONE_BRIDGE_URL must use HTTPS for release');
} catch {
  check('bridge_url_scheme', false, 'PHONE_BRIDGE_URL must be a valid HTTPS URL');
}

check(
  'otp_provider',
  String(process.env.PHONE_OTP_PROVIDER ?? '').trim().toLowerCase() === 'twilio'
    && present('TWILIO_ACCOUNT_SID')
    && present('TWILIO_AUTH_TOKEN')
    && present('TWILIO_VERIFY_SERVICE_SID'),
  'Twilio Verify credentials are present (values withheld)',
);
check('ui_enabled', truthy(process.env.PHONE_CONNECTION_UI_ENABLED), 'PHONE_CONNECTION_UI_ENABLED=1');

if (strict) {
  check('agent_enabled', truthy(process.env.PHONE_AGENT_ENABLED), 'PHONE_AGENT_ENABLED=1');
  check('real_call_proven', truthy(process.env.PHONE_REAL_CALL_PROVEN), 'PHONE_REAL_CALL_PROVEN=1 only after recorded real tests');
}

if (checkHealth && bridgeUrl) {
  try {
    const response = await fetch(new URL('/health', bridgeUrl), { signal: AbortSignal.timeout(5000) });
    const body = await response.json().catch(() => ({}));
    check('bridge_health', response.ok && body?.ok === true, `GET ${bridgeUrl.origin}/health returned HTTP ${response.status}`);
  } catch (error) {
    check('bridge_health', false, `bridge health request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

const result = {
  status: failures.length === 0 ? 'READY' : 'BLOCKED',
  mode: strict ? 'strict' : 'prepare',
  checks,
  missing_or_failed: failures,
  note: 'No secret values were printed; no external state was changed.',
};
console.log(JSON.stringify(result, null, 2));

if (strict && failures.length > 0) process.exit(1);
