/** @jest-environment node */
/** Which engine draws a deck's slide pictures: Google's image model, else none (Imagen 4 is retired). */
jest.mock('server-only', () => ({}));
jest.mock('@resvg/resvg-js', () => ({ Resvg: jest.fn() }));
jest.mock('../../ai/google/transport', () => ({ googleImageTransportBlocker: jest.fn() }));
jest.mock('../../ai/geminiImage', () => ({ generateGeminiImage: jest.fn() }));
jest.mock('../../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn() }));
jest.mock('../../pipeline/compositing/ffmpeg-overlay', () => ({ overlayFontFiles: jest.fn(() => []) }));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn() }));
jest.mock('../../orchestrator/jobs', () => ({ updateJobStage: jest.fn() }));
jest.mock('../../observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('./deckOutline', () => ({ generateOutline: jest.fn() }));

import { deckImageEngine } from './deckPipeline';
import { googleImageTransportBlocker } from '../../ai/google/transport';

const blocker = googleImageTransportBlocker as jest.Mock;

test('Google image transport available → Google image model draws the slides', () => {
  blocker.mockReturnValue(null);
  expect(deckImageEngine()).toBe('gemini-image');
});

test('no Google image transport → no pictures (a text-only deck, never a guess)', () => {
  blocker.mockReturnValue('no Vertex credentials');
  expect(deckImageEngine()).toBeNull();
});
