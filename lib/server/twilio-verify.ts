import 'server-only';

type TwilioVerifyResponse = {
  status?: string;
  message?: string;
};

function getRequiredEnv(name: 'TWILIO_ACCOUNT_SID' | 'TWILIO_AUTH_TOKEN' | 'TWILIO_VERIFY_SERVICE_SID'): string {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`missing_${name.toLowerCase()}`);
  }
  return value;
}

function twilioAuthHeader(accountSid: string, authToken: string): string {
  const encoded = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  return `Basic ${encoded}`;
}

function parseTwilioError(payload: TwilioVerifyResponse | null, fallback: string): string {
  const message = String(payload?.message || '').trim();
  return message || fallback;
}

export function normalizePhoneE164(value: string): string {
  const normalized = String(value || '').trim().replace(/\s+/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error('invalid_phone');
  }
  return normalized;
}

export function normalizeOtpCode(value: string): string {
  const normalized = String(value || '').trim();
  if (!/^\d{4,8}$/.test(normalized)) {
    throw new Error('invalid_code');
  }
  return normalized;
}

async function twilioPost(path: string, body: URLSearchParams): Promise<{ ok: boolean; payload: TwilioVerifyResponse | null; status: number }> {
  const accountSid = getRequiredEnv('TWILIO_ACCOUNT_SID');
  const authToken = getRequiredEnv('TWILIO_AUTH_TOKEN');

  const response = await fetch(`https://verify.twilio.com/v2${path}`, {
    method: 'POST',
    headers: {
      Authorization: twilioAuthHeader(accountSid, authToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });

  const payload = (await response
    .json()
    .catch(() => null)) as TwilioVerifyResponse | null;

  return {
    ok: response.ok,
    payload,
    status: response.status,
  };
}

export async function sendOtpSms(phone: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const serviceSid = getRequiredEnv('TWILIO_VERIFY_SERVICE_SID');

  const body = new URLSearchParams();
  body.set('To', phone);
  body.set('Channel', 'sms');

  const result = await twilioPost(`/Services/${encodeURIComponent(serviceSid)}/Verifications`, body);

  if (!result.ok) {
    return {
      ok: false,
      error: parseTwilioError(result.payload, `twilio_send_failed_${result.status}`),
    };
  }

  return { ok: true };
}

export async function checkOtpCode(params: {
  phone: string;
  code: string;
}): Promise<{ ok: true; status: 'approved' } | { ok: false; status: string; error?: string }> {
  const serviceSid = getRequiredEnv('TWILIO_VERIFY_SERVICE_SID');

  const body = new URLSearchParams();
  body.set('To', params.phone);
  body.set('Code', params.code);

  const result = await twilioPost(`/Services/${encodeURIComponent(serviceSid)}/VerificationCheck`, body);
  const status = String(result.payload?.status || '').trim().toLowerCase() || 'failed';

  if (!result.ok) {
    return {
      ok: false,
      status,
      error: parseTwilioError(result.payload, `twilio_check_failed_${result.status}`),
    };
  }

  if (status === 'approved') {
    return { ok: true, status: 'approved' };
  }

  return {
    ok: false,
    status,
  };
}
