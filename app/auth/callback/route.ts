import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (code) {
    try {
      const { data, error } = await supabaseServer.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error("Auth callback error:", error);
        return NextResponse.redirect(new URL("/?error=auth", req.url));
      }

      return NextResponse.redirect(new URL("/workspace", req.url));
    } catch (error) {
      console.error("Auth callback exception:", error);
      return NextResponse.redirect(new URL("/?error=auth", req.url));
    }
  }

  return NextResponse.redirect(new URL("/", req.url));
}
