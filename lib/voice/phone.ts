const GEORGIAN_E164_REGEX = /^\+9955\d{8}$/;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizePhoneNumber(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) {
    return '';
  }

  if (value.startsWith('+')) {
    const stripped = `+${onlyDigits(value)}`;
    return stripped;
  }

  const digits = onlyDigits(value);

  if (digits.startsWith('995')) {
    return `+${digits}`;
  }

  if (digits.length === 9 && digits.startsWith('5')) {
    return `+995${digits}`;
  }

  return digits ? `+${digits}` : '';
}

export function isValidGeorgianMobile(rawValue: string): boolean {
  const normalized = normalizePhoneNumber(rawValue);
  return GEORGIAN_E164_REGEX.test(normalized);
}

export function formatGeorgianLocalNumber(rawValue: string): string {
  const digits = onlyDigits(rawValue).replace(/^995/, '').replace(/^\+/, '');
  const local = digits.startsWith('5') ? digits : `5${digits}`;
  const trimmed = local.slice(0, 9);

  if (trimmed.length <= 3) {
    return trimmed;
  }

  if (trimmed.length <= 6) {
    return `${trimmed.slice(0, 3)} ${trimmed.slice(3)}`;
  }

  return `${trimmed.slice(0, 3)} ${trimmed.slice(3, 6)} ${trimmed.slice(6)}`;
}

export function toGeorgianE164FromLocal(localNumber: string): string {
  const digits = onlyDigits(localNumber);
  if (digits.length === 9 && digits.startsWith('5')) {
    return `+995${digits}`;
  }

  return normalizePhoneNumber(localNumber);
}
