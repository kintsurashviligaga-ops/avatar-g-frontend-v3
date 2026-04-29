type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

export const AGENT_G_VAPI_CONFIG = {
  name: 'Agent G — MyAvatar.ge',
  model: {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    temperature: 0.7,
    systemPrompt: `შენ ხარ Agent G — MyAvatar.ge-ის AI ასისტენტი, Georgia-ს პირველი AI პლატფორმის ხმა.

ᲫᲘᲠᲘᲗᲐᲓᲘ ᲬᲔᲡᲔᲑᲘ:
- ლაპარაკობ იმ ენაზე, რომელზეც მომხმარებელი გელაპარაკება (KA/EN/RU)
- სატელეფონო საუბარია — მოკლე, მკაფიო პასუხები (max 2-3 წინადადება)
- ოთხჯერ გთხოვ — ნომრები და სახელები სიტყვიერად წარმოთქვი
- ყოველთვის იყავი სასარგებლო, არასდროს გაჩერდე ამოცანა სრულამდე

ᲨᲔᲒᲘᲫᲚᲘᲐ:
- სურათების გენერაცია (FLUX.1 Pro)
- ვიდეოს შექმნა
- ავატარის შექმნა
- ხმოვანი კონტენტი
- ნებისმიერი MyAvatar.ge სერვისი

CALL FLOW:
1. მიესალმე სახელით (თუ ცნობ)
2. კითხე რა გჭირდება
3. დაადასტურე ამოცანა
4. შეასრულე (job შექმენი)
5. დაარქვი job ID და სკანი ინფო
6. შესთავაზე სხვა დახმარება`,
  },
  voice: {
    provider: 'elevenlabs',
    voiceId: process.env.ELEVENLABS_GEORGIAN_VOICE_ID || '',
    stability: 0.5,
    similarityBoost: 0.75,
    model: 'eleven_multilingual_v2',
    language: 'ka',
  },
  firstMessage: 'გამარჯობა! მე ვარ Agent G. როგორ დაგეხმარებით დღეს?',
  endCallMessage: 'გმადლობთ! თქვენი შეკვეთა დამუშავდება. ნახვამდის!',
  maxDurationSeconds: 1800,
  silenceTimeoutSeconds: 30,
  backgroundSound: 'off',
  recordingEnabled: true,
  hipaaEnabled: false,
} as const;

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_job',
      description: 'Creates an AI generation job for the user',
      parameters: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            enum: [
              'image-generation',
              'video-generation',
              'avatar-studio',
              'voice-synthesis',
              'music-studio',
              'copy-ai',
            ],
          },
          prompt: { type: 'string' },
          params: { type: 'object' },
        },
        required: ['service', 'prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_job_status',
      description: 'Gets the status of a previously created job',
      parameters: {
        type: 'object',
        properties: {
          job_id: { type: 'string' },
        },
        required: ['job_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_credits',
      description: 'Gets the user\'s remaining credits',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

type BuildVoiceConfigOptions = {
  webhookUrl?: string;
  firstMessage?: string;
  metadata?: Record<string, unknown>;
};

export function buildAgentGVapiAssistantConfig(options: BuildVoiceConfigOptions = {}): Record<string, unknown> {
  const georgianVoiceId = String(process.env.ELEVENLABS_GEORGIAN_VOICE_ID || '').trim();
  const fallbackVoiceId = String(process.env.ELEVENLABS_VOICE_ID || '').trim();
  const selectedVoiceId = georgianVoiceId || fallbackVoiceId || AGENT_G_VAPI_CONFIG.voice.voiceId;

  return {
    name: AGENT_G_VAPI_CONFIG.name,
    model: {
      provider: 'anthropic',
      model: AGENT_G_VAPI_CONFIG.model.model,
      temperature: AGENT_G_VAPI_CONFIG.model.temperature,
      messages: [
        {
          role: 'system',
          content: AGENT_G_VAPI_CONFIG.model.systemPrompt,
        },
      ],
      tools: TOOL_DEFINITIONS,
    },
    voice: {
      provider: '11labs',
      voiceId: selectedVoiceId,
      stability: AGENT_G_VAPI_CONFIG.voice.stability,
      similarityBoost: AGENT_G_VAPI_CONFIG.voice.similarityBoost,
      model: AGENT_G_VAPI_CONFIG.voice.model,
      language: georgianVoiceId ? 'ka' : 'en',
    },
    firstMessage: options.firstMessage || AGENT_G_VAPI_CONFIG.firstMessage,
    endCallMessage: AGENT_G_VAPI_CONFIG.endCallMessage,
    maxDurationSeconds: AGENT_G_VAPI_CONFIG.maxDurationSeconds,
    silenceTimeoutSeconds: AGENT_G_VAPI_CONFIG.silenceTimeoutSeconds,
    backgroundSound: AGENT_G_VAPI_CONFIG.backgroundSound,
    recordingEnabled: AGENT_G_VAPI_CONFIG.recordingEnabled,
    server: options.webhookUrl ? { url: options.webhookUrl } : undefined,
    metadata: {
      georgianVoicePreferred: Boolean(georgianVoiceId),
      georgianVoiceFallbackUsed: !Boolean(georgianVoiceId),
      ...(options.metadata || {}),
    },
  };
}
