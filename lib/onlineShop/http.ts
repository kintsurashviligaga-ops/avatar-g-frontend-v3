import { NextRequest, NextResponse } from 'next/server';

export const DEV_FALLBACK_USER_ID = 'dev-user-1';

export function getRequestUserId(request: NextRequest): string {
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId && headerUserId.trim().length > 0) {
    return headerUserId.trim();
  }

  return DEV_FALLBACK_USER_ID;
}

export function okResponse<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data, error: null }, { status });
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, data: null, error: message }, { status });
}
