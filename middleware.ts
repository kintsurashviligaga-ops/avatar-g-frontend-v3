import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // SECURITY FIX: CORS policy changed from "*" to whitelist
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());
  const origin = request.headers.get('origin');

  const response = NextResponse.next();

  // Apply CORS only if origin is in whitelist
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID");
    response.headers.set("Access-Control-Max-Age", "86400");
  } else if (request.method === "OPTIONS") {
    // Reject preflight requests from non-whitelisted origins
    return new NextResponse(null, { status: 204 });
  }

  // Security headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  return response;
}

export const config = {
  matcher: "/api/:path*"
};
