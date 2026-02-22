function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '');
}

export function resolveBackendUrl(): string {
  const preferred =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    '';

  return preferred ? normalizeUrl(preferred) : '';
}
