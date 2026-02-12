import { NextRequest } from "next/server";
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

    // 3. Authorization check (SECURITY FIX: Added authentication)
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

    const { message } = validation.data;

    if (!process.env.GROQ_API_KEY) {
      return apiError(new Error('Service not configured'), 503, 'Service temporarily unavailable');
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mixtral-8x7b-32768",
        messages: [
          { role: "system", content: "შენ ხარ Avatar G-ს AI ასისტენტი. უპასუხე ქართულ ენაზე." },
          { role: "user", content: message }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      return apiError(new Error(`API error: ${response.status}`), 502, 'Service error');
    }

    const data = await response.json();
    const output = data.choices?.[0]?.message?.content;
    if (!output) {
      return apiError(new Error('Empty response from API'), 502, 'Service error');
    }

    return apiSuccess({ response: output, provider: 'Groq' });
  } catch (error) {
    return apiError(error, 500);
  }
}
