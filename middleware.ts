import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * PRODUCTION-SAFE MIDDLEWARE
 * 
 * Wrapped in try/catch to prevent crashes.
 * Uses safe defaults if env vars missing.
 * Never throws - always returns response.
 */
export function middleware(request: NextRequest) {
  try {
    // SECURITY FIX: CORS policy changed from "*" to whitelist
    // Fallback includes: localhost (dev), staging, production domain
    const defaultOrigins = [
      'http://localhost:3000',
      'http://localhost:3001', 
      'https://www.myavatar.ge',
      'https://myavatar.ge',
      'https://staging-myavatar.ge',
    ].join(',');
    
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins)
      .split(',')
      .map(o => o.trim());
    
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
      return new NextResponse(null, { status: 403 });
    }

    // Security headers
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("X-Content-Type-Options", "nosniff");

    return response;
  } catch (error) {
    // NEVER crash middleware - log and return safe response
    console.error('[Middleware Error]', error instanceof Error ? error.message : 'Unknown error');
    
    // Return response with security headers but no CORS
    const response = NextResponse.next();
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
}

export const config = {
  matcher: "/api/:path*"
};
