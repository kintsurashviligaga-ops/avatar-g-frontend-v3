import { detectEmotion, mapEmotionToTone } from '@/lib/agentg/personality';

describe('Agent G personality emotion detection', () => {
  test('maps stressed georgian text to calm tone', () => {
    const detection = detectEmotion('ძალიან ვნერვიულობ და არ ვიცი რა გავაკეთო');
    const mapped = mapEmotionToTone(detection);

    expect(detection.detectedEmotion).toBe('stressed_angry');
    expect(mapped.tone.mood).toBe('calm');
    expect(mapped.voiceHint).toContain('slower pace');
  });

  test('maps excited text to excited tone', () => {
    const detection = detectEmotion('ვაუ მაგარია! ეს ძაან მაგარი გამოვიდა');
    const mapped = mapEmotionToTone(detection);

    expect(detection.detectedEmotion).toBe('happy_positive');
    expect(mapped.tone.mood).toBe('excited');
    expect(mapped.voiceHint).toContain('brighter tone');
  });

  test('maps neutral text to friendly tone', () => {
    const detection = detectEmotion('გამარჯობა');
    const mapped = mapEmotionToTone(detection);

    expect(detection.detectedEmotion).toBe('neutral');
    expect(mapped.tone.mood).toBe('friendly');
  });
});
