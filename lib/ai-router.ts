// lib/ai-router.ts - AI Router for chatbot and services
// Re-exports from serviceRunner for compatibility

export { 
  runService,
  executeService,
  PROVIDERS, 
  SERVICE_PROVIDER_MAP 
} from './api/serviceRunner';

export type { 
  ServiceRequest, 
  ServiceResponse 
} from './api/serviceRunner';
