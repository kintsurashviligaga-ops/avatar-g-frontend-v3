/** @jest-environment node */
/** Which engine draws a deck's slide pictures: Imagen 4 only when switched on, else Google's image model, else none. */
jest.mock('server-only', () => ({}));
jest.mock('@resvg/resvg-js', () => ({ Resvg: jest.fn() }));
jest.mock('../../ai/geminiImagen', () => ({ hasGeminiImagenProvider: jest.fn(), generateImagenImages: jest.fn(), mapImagenAspect: jest.fn() }));
jest.mock('../../ai/google/transport', () => ({ googleImageTransportBlocker: jest.fn() }));
jest.mock('../../ai/geminiImage', () => ({ generateGeminiImage: jest.fn() }));
jest.mock('../../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn() }));
jest.mock('../../pipeline/compositing/ffmpeg-overlay', () => ({ overlayFontFiles: jest.fn(() => []) }));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn() }));
jest.mock('../../orchestrator/jobs', () => ({ updateJobStage: jest.fn() }));
jest.mock('../../observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('./deckOutline', () => ({ generateOutline: jest.fn() }));

import { deckImageEngine } from './deckPipeline';
import { hasGeminiImagenProvider } from '../../ai/geminiImagen';
import { googleImageTransportBlocker } from '../../ai/google/transport';

const imagen = hasGeminiImagenProvider as jest.Mock;
const blocker = googleImageTransportBlocker as jest.Mock;

test('Imagen 4 off (production today) → Google image model draws the slides', () => {
  imagen.mockReturnValue(false);
  blocker.mockReturnValue(null);
  expect(deckImageEngine()).toBe('gemini-image');
});

test('Imagen 4 explicitly switched on → Imagen 4', () => {
  imagen.mockReturnValue(true);
  blocker.mockReturnValue(null);
  expect(deckImageEngine()).toBe('imagen');
});

test('no Google image transport → no pictures (a text-only deck, never a guess)', () => {
  imagen.mockReturnValue(false);
  blocker.mockReturnValue('no Vertex credentials');
  expect(deckImageEngine()).toBeNull();
});
