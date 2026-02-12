import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ChatMessageSchema, validateInput } from "@/lib/api/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting
    const rateLimitError = await checkRateLimit(req, RATE_LIMITS.WRITE);
    if (rateLimitError) return rateLimitError;

    // 2. Input validation
    const body = await req.json();
    const validation = validateInput(ChatMessageSchema, body);
    if (!validation.success) {
      return apiError(new Error(validation.error), 400, 'Invalid request');
    }

    // 3. Authorization check
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return apiError(new Error('Unauthorized'), 401, 'Missing required authorization');
    }

    const token = authHeader.slice(7);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return apiError(new Error('Unauthorized'), 401, 'Invalid token');
    }

    // 4. Check if Gemini is configured
    if (!process.env.GEMINI_API_KEY) {
      return apiError(new Error('Service not configured'), 503, 'Service temporarily unavailable');
    }

    const { message } = validation.data;

    // 5. Call Gemini API (SECURITY FIX: API key now in body, not URL)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `შენ ხარ Avatar G-ს AI ასისტენტი. უპასუხე ქართულ ენაზე.\n\nმომხმარებელი: ${message}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
        apiKey: process.env.GEMINI_API_KEY // SECURITY: Moved from URL to body
      }),
    });

    if (!response.ok) {
      return apiError(new Error(`Gemini error: ${response.status}`), 502, 'Service error');
    }

    const data = await response.json();
    const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!output) {
      return apiError(new Error('Empty response from API'), 502, 'Service error');
    }

    return apiSuccess({ response: output, provider: 'Gemini' });
  } catch (error) {
    return apiError(error, 500);
  }
}
