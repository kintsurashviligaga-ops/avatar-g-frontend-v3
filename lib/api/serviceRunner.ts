// lib/api/serviceRunner.ts - Multi-Provider AI Service Router
// Version: flexible runService

export interface ServiceRequest {
  prompt: string;
  language?: string;
  quality?: 'fast' | 'balanced' | 'premium';
  params?: Record<string, any>;
  serviceId?: string;
}

export interface ServiceResponse {
  success: boolean;
  output?: {
    type: 'text' | 'image' | 'audio' | 'video';
    text?: string;
    files?: Array<{ name: string; url: string; type: string }>;
  };
  error?: string;
  meta?: {
    provider: string;
    model?: string;
    duration?: number;
    [key: string]: any;
  };
}

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    models: { fast: 'gemini-flash', balanced: 'gemini-pro', premium: 'gemini-pro' },
    supports: ['text-intelligence', 'chat', 'analysis', 'ai-production'],
  },
  openai: {
    name: 'OpenAI',
    models: { fast: 'gpt-4o-mini', balanced: 'gpt-4o', premium: 'gpt-4o' },
    supports: ['music-studio', 'video-cine-lab', 'prompt-builder'],
  },
  anthropic: {
    name: 'Anthropic Claude',
    models: { fast: 'claude-3-haiku-20240307', balanced: 'claude-3-sonnet-20240229', premium: 'claude-3-opus-20240229' },
    supports: ['business-agent', 'strategy', 'documents'],
  },
  elevenlabs: {
    name: 'ElevenLabs',
    models: { fast: 'eleven_turbo_v2_5', balanced: 'eleven_multilingual_v2', premium: 'eleven_multilingual_v2' },
    supports: ['voice-lab'],
  },
};

const SERVICE_PROVIDER_MAP: Record<string, string> = {
  'text-intelligence': 'openai', 'chat': 'openai', 'analysis': 'gemini', 'ai-production': 'gemini',
  'business-agent': 'anthropic', 'strategy': 'anthropic', 'documents': 'anthropic',
  'music-studio': 'openai', 'video-cine-lab': 'openai', 'prompt-builder': 'openai',
  'voice-lab': 'elevenlabs', 'image-generator': 'pollinations', 'avatar-builder': 'pollinations',
};

function getApiKey(provider: string): string | undefined {
  const keys: Record<string, string | undefined> = {
    gemini: process.env.GEMINI_API_KEY, openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY, elevenlabs: process.env.ELEVENLABS_API_KEY,
  };
  return keys[provider];
}

// FLEXIBLE: executeService accepts (serviceId, request) OR ({serviceId, ...request})
export async function executeService(
  arg1: string | ServiceRequest,
  arg2?: ServiceRequest
): Promise<ServiceResponse> {
  let serviceId: string;
  let request: ServiceRequest;

  if (typeof arg1 === 'string' && arg2) {
    serviceId = arg1;
    request = arg2;
  } else if (typeof arg1 === 'object' && arg1.serviceId) {
    serviceId = arg1.serviceId;
    request = arg1;
  } else {
    throw new Error('Invalid arguments to executeService');
  }

  return runServiceInternal(serviceId, request);
}

// FLEXIBLE: runService accepts (serviceId, request) OR ({serviceId, ...request})
export async function runService(
  arg1: string | ServiceRequest,
  arg2?: ServiceRequest
): Promise<ServiceResponse> {
  return executeService(arg1 as any, arg2 as any);
}

async function runServiceInternal(serviceId: string, request: ServiceRequest): Promise<ServiceResponse> {
  const startTime = Date.now();
  try {
    const provider = SERVICE_PROVIDER_MAP[serviceId] || 'gemini';
    const apiKey = getApiKey(provider);
    
    if (!apiKey || apiKey.includes('your_actual') || apiKey.includes('...')) {
      return {
        success: true,
        output: { type: 'text', text: getFallbackResponse(serviceId, request.language || 'ka') },
        meta: { provider: 'fallback', model: 'placeholder', note: 'API key not configured' },
      };
    }

    switch (provider) {
      case 'gemini': return await callGemini(serviceId, request, apiKey, startTime);
      case 'openai': return await callOpenAI(serviceId, request, apiKey, startTime);
      case 'anthropic': return await callAnthropic(serviceId, request, apiKey, startTime);
      case 'elevenlabs': return await callElevenLabs(serviceId, request, apiKey, startTime);
      default: return await callPollinations(serviceId, request, startTime);
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error', meta: { provider: 'error' } };
  }
}

async function callGemini(serviceId: string, request: ServiceRequest, apiKey: string, startTime: number): Promise<ServiceResponse> {
  const quality = request.quality || 'balanced';
  const model = PROVIDERS.gemini.models[quality];
  const prompt = buildPrompt(serviceId, request);
  const url = 'https://generativelanguage.googleapis.com/v1/models/' + model + ':generateContent?key=' + apiKey;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: quality === 'premium' ? 0.7 : quality === 'fast' ? 0.9 : 0.8, maxOutputTokens: getMaxTokens(serviceId) },
    }),
  });

  if (!response.ok) throw new Error('Gemini API error: ' + response.status);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return { success: true, output: { type: 'text', text }, meta: { provider: 'gemini', model, duration: Date.now() - startTime, language: request.language } };
}

async function callOpenAI(serviceId: string, request: ServiceRequest, apiKey: string, startTime: number): Promise<ServiceResponse> {
  const quality = request.quality || 'balanced';
  const model = PROVIDERS.openai.models[quality];
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: getSystemPrompt(serviceId, request.language) }, { role: 'user', content: request.prompt }],
      temperature: quality === 'premium' ? 0.7 : 0.8,
      max_tokens: getMaxTokens(serviceId),
    }),
  });

  if (!response.ok) throw new Error('OpenAI API error: ' + response.status);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  return { success: true, output: { type: 'text', text }, meta: { provider: 'openai', model, duration: Date.now() - startTime } };
}

async function callAnthropic(serviceId: string, request: ServiceRequest, apiKey: string, startTime: number): Promise<ServiceResponse> {
  const quality = request.quality || 'balanced';
  const model = PROVIDERS.anthropic.models[quality];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: getMaxTokens(serviceId),
      messages: [{ role: 'user', content: getSystemPrompt(serviceId, request.language) + '\n\n' + request.prompt }],
    }),
  });

  if (!response.ok) throw new Error('Anthropic API error: ' + response.status);
  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  return { success: true, output: { type: 'text', text }, meta: { provider: 'anthropic', model, duration: Date.now() - startTime } };
}

async function callElevenLabs(serviceId: string, request: ServiceRequest, apiKey: string, startTime: number): Promise<ServiceResponse> {
  const quality = request.quality || 'balanced';
  const model = PROVIDERS.elevenlabs.models[quality];
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'default';
  
  return {
    success: true,
    output: { type: 'audio', text: request.prompt, files: [{ name: 'generated-voice.mp3', url: 'https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, type: 'audio/mpeg' }] },
    meta: { provider: 'elevenlabs', model, duration: Date.now() - startTime },
  };
}

async function callPollinations(serviceId: string, request: ServiceRequest, startTime: number): Promise<ServiceResponse> {
  const encodedPrompt = encodeURIComponent(request.prompt);
  const width = request.params?.width || 1024;
  const height = request.params?.height || 1024;
  const imageUrl = 'https://image.pollinations.ai/' + width + 'x' + height + '?prompt=' + encodedPrompt + '&model=flux&enhance=true';

  return {
    success: true,
    output: { type: 'image', text: request.prompt, files: [{ name: 'generated.png', url: imageUrl, type: 'image/png' }] },
    meta: { provider: 'pollinations', model: 'flux', duration: Date.now() - startTime },
  };
}

function buildPrompt(serviceId: string, request: ServiceRequest): string {
  const lang = request.language || 'ka';
  const prompts: Record<string, Record<string, string>> = {
    'text-intelligence': { ka: 'შენ ხარ ქართული ენის AI ასისტენტი. პასუხი მიეცი ქართულად.\n\nმოთხოვნა: ' + request.prompt, en: 'You are a helpful AI assistant.\n\nRequest: ' + request.prompt, ru: 'Вы полезный ИИ-ассистент.\n\nЗапрос: ' + request.prompt },
    'video-cine-lab': { ka: 'შექმენი კინემატოგრაფიული ვიდეოს სცენარი.\n\nმოთხოვნა: ' + request.prompt, en: 'Create a cinematic video scenario.\n\nRequest: ' + request.prompt, ru: 'Создайте сценарий кинематографического видео.\n\nЗапрос: ' + request.prompt },
  };
  return prompts[serviceId]?.[lang] || request.prompt;
}

function getSystemPrompt(serviceId: string, language?: string): string {
  const prompts: Record<string, Record<string, string>> = {
    'video-cine-lab': { ka: 'შენ ხარ კინემატოგრაფიული ვიდეოს რეჟისორი.', en: 'You are a cinematic video director.', ru: 'Вы режиссер кинематографического видео.' },
  };
  return prompts[serviceId]?.[language || 'en'] || 'You are a helpful AI assistant.';
}

function getMaxTokens(serviceId: string): number {
  const limits: Record<string, number> = { 'text-intelligence': 1500, 'business-agent': 4000, 'music-studio': 2000, 'video-cine-lab': 3000, 'ai-production': 2500, 'chat': 1500 };
  return limits[serviceId] || 2000;
}

function getFallbackResponse(serviceId: string, language: string): string {
  const responses: Record<string, Record<string, string>> = {
    'text-intelligence': { ka: 'გამარჯობა! მე ვარ Avatar G-ს AI ასისტენტი.', en: 'Hello! I am Avatar G AI assistant.', ru: 'Здравствуйте! Я AI-ассистент Avatar G.' },
    'video-cine-lab': { ka: 'ვიდეოს გენერაცია დროებით მიუწვდომელია.', en: 'Video generation is temporarily unavailable.', ru: 'Генерация видео временно недоступна.' },
  };
  return responses[serviceId]?.[language] || responses[serviceId]?.['en'] || 'Service temporarily unavailable.';
}

export { PROVIDERS, SERVICE_PROVIDER_MAP };
