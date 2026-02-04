import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle root path
  if (pathname === "/" || pathname === "/index") {
    // Check if onboarding is done (cookie)
    const onboardingDone = request.cookies.get("ag_onboarding_done")?.value;
    
    if (!onboardingDone) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    
    return NextResponse.redirect(new URL("/workspace", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/index"],
};
