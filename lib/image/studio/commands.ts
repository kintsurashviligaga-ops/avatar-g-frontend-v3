import { type ImageRequest, parseImageRequest } from './contracts';
import { ImageError } from './errors';

/** Conservative workspace commands. Parameters/references stay explicit; the original text is never rewritten. */
export function imageCommand(value: unknown): ImageRequest {
  const request = parseImageRequest(value);
  if (request.operation !== 'generate') return request; // explicit operation always wins
  const text = request.originalPrompt.toLocaleLowerCase();
  if (/\b(upscale|transparent|seed|mask)\b|გამჭვირვალე|აპსკეილ|прозрачн|апскейл/.test(text)) {
    throw new ImageError('unsupported_capability', 'This command requires an unsupported image capability.');
  }
  if (!request.references.length) return request;
  const operation = /ფონ|background|фон/.test(text) ? 'replace_background'
    : /ტანსაცმ|ჩააცვი|პერსონაჟ|outfit|character|одежд|персонаж/.test(text) ? 'character_variation'
    : /პროდუქტ|product|товар|продукт/.test(text) ? 'product_scene'
    : /წაშალ|მოაშორ|remove|удал/.test(text) ? 'remove_object' : 'edit';
  return parseImageRequest({ ...request, operation });
}
