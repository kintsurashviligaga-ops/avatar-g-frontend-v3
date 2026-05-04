/**
 * lib/gemini/image-analysis.ts
 * =============================
 * Room/interior image analysis using Gemini Pro multimodal.
 * Extracts style, materials, colors, lighting, and generates
 * a Marble/WorldLabs 3D prompt.
 */

import { generateWithGemini } from './client';
import { getGeminiSystemPrompt } from './prompts';

export interface RoomAnalysisResult {
  style: string;
  materials: string[];
  colors: string[];
  lighting: string;
  issues: string[];
  suggestions: string[];
  marblePrompt: string;
  confidence: number;
}

export async function analyzeRoomImage(
  imageBase64: string,
  mimeType: string,
  locale: string,
): Promise<RoomAnalysisResult> {
  const systemPrompt = getGeminiSystemPrompt('interior', locale);

  const analysisPrompt =
    locale === 'ka'
      ? `გაანალიზე ეს ოთახის ფოტო. დააბრუნე JSON ამ სტრუქტურით: {"style":"","materials":[],"colors":[],"lighting":"","issues":[],"suggestions":[],"marblePrompt":"","confidence":0.0}. marblePrompt უნდა იყოს ინგლისური, პროფესიონალური არქიტექტურული prompt Marble/WorldLabs 3D API-სთვის, 8K detail-ით.`
      : `Analyze this room photo. Return JSON: {"style":"","materials":[],"colors":[],"lighting":"","issues":[],"suggestions":[],"marblePrompt":"","confidence":0.0}. marblePrompt must be a professional architectural prompt for Marble/WorldLabs 3D API with 8K detail.`;

  const response = await generateWithGemini({
    prompt: analysisPrompt,
    systemPrompt,
    tier: 'pro',
    attachments: [{ type: 'image', mimeType, data: imageBase64 }],
    temperature: 0.3,
  });

  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as RoomAnalysisResult;
  } catch {
    // Fall through to default
  }

  return {
    style: 'Unknown',
    materials: [],
    colors: [],
    lighting: 'Unknown',
    issues: [],
    suggestions: [response.text],
    marblePrompt: '',
    confidence: 0.5,
  };
}
