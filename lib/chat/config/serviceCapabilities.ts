/**
 * lib/chat/config/serviceCapabilities.ts
 * Maps each service to its chat adapter capabilities.
 */

export interface ServiceCapability {
  serviceSlug: string;
  agentId: string;
  inputTypes: string[];
  outputTypes: string[];
  nextServices: string[];
  exportFormats: string[];
  quickActionIds: string[];
  chatPlaceholder: { en: string; ka: string; ru: string };
}

export const SERVICE_CAPABILITIES: ServiceCapability[] = [
  {
    serviceSlug: 'avatar',
    agentId: 'avatar-agent',
    inputTypes: ['text', 'image'],
    outputTypes: ['image', '3d-model'],
    nextServices: ['video', 'image', 'store'],
    exportFormats: ['png', 'jpg', 'webp', 'glb'],
    quickActionIds: ['create-avatar'],
    chatPlaceholder: {
      en: 'Describe your avatar style…',
      ka: 'აღწერეთ ავატარის სტილი…',
      ru: 'Опишите стиль аватара…',
    },
  },
  {
    serviceSlug: 'video',
    agentId: 'video-agent',
    inputTypes: ['text', 'image', 'video'],
    outputTypes: ['video'],
    nextServices: ['music', 'subtitle', 'reels', 'thumbnail'],
    exportFormats: ['mp4', 'webm'],
    quickActionIds: ['generate-video'],
    chatPlaceholder: {
      en: 'Describe the video you want…',
      ka: 'აღწერეთ სასურველი ვიდეო…',
      ru: 'Опишите нужное видео…',
    },
  },
  {
    serviceSlug: 'image',
    agentId: 'image-agent',
    inputTypes: ['text', 'image'],
    outputTypes: ['image'],
    nextServices: ['video', 'store', 'thumbnail', 'marketing'],
    exportFormats: ['png', 'jpg', 'webp', 'svg'],
    quickActionIds: ['create-poster'],
    chatPlaceholder: {
      en: 'Describe the image or poster…',
      ka: 'აღწერეთ სურათი ან პოსტერი…',
      ru: 'Опишите изображение или постер…',
    },
  },
  {
    serviceSlug: 'music',
    agentId: 'music-agent',
    inputTypes: ['text', 'audio'],
    outputTypes: ['audio'],
    nextServices: ['video', 'subtitle', 'reels'],
    exportFormats: ['mp3', 'wav'],
    quickActionIds: ['generate-music'],
    chatPlaceholder: {
      en: 'Describe the music style…',
      ka: 'აღწერეთ მუსიკის სტილი…',
      ru: 'Опишите стиль музыки…',
    },
  },
  {
    serviceSlug: 'subtitle',
    agentId: 'subtitle-agent',
    inputTypes: ['video', 'audio', 'text'],
    outputTypes: ['text', 'document'],
    nextServices: ['video', 'reels'],
    exportFormats: ['srt', 'vtt', 'txt'],
    quickActionIds: [],
    chatPlaceholder: {
      en: 'Upload video for subtitles…',
      ka: 'ატვირთეთ ვიდეო სუბტიტრებისთვის…',
      ru: 'Загрузите видео для субтитров…',
    },
  },
  {
    serviceSlug: 'shop',
    agentId: 'store-agent',
    inputTypes: ['text', 'image'],
    outputTypes: ['text', 'document'],
    nextServices: ['seo', 'affiliate', 'image'],
    exportFormats: ['json', 'csv'],
    quickActionIds: ['store-setup'],
    chatPlaceholder: {
      en: 'Describe your product or store…',
      ka: 'აღწერეთ პროდუქტი ან მაღაზია…',
      ru: 'Опишите продукт или магазин…',
    },
  },
  {
    serviceSlug: 'business',
    agentId: 'business-agent',
    inputTypes: ['text', 'document'],
    outputTypes: ['text', 'document'],
    nextServices: ['revenue', 'risk', 'executive'],
    exportFormats: ['pdf', 'docx', 'json'],
    quickActionIds: ['business-plan'],
    chatPlaceholder: {
      en: 'Describe your business idea…',
      ka: 'აღწერეთ ბიზნეს იდეა…',
      ru: 'Опишите бизнес-идею…',
    },
  },
  {
    serviceSlug: 'dev',
    agentId: 'dev-agent',
    inputTypes: ['text', 'document'],
    outputTypes: ['text', 'document'],
    nextServices: ['business'],
    exportFormats: ['json', 'md', 'txt'],
    quickActionIds: [],
    chatPlaceholder: {
      en: 'Describe the app or feature…',
      ka: 'აღწერეთ აპლიკაცია ან ფუნქცია…',
      ru: 'Опишите приложение или функцию…',
    },
  },
];

export function getServiceCapability(slug: string): ServiceCapability | undefined {
  return SERVICE_CAPABILITIES.find(s => s.serviceSlug === slug);
}

export function getServiceForAgent(agentId: string): ServiceCapability | undefined {
  return SERVICE_CAPABILITIES.find(s => s.agentId === agentId);
}
