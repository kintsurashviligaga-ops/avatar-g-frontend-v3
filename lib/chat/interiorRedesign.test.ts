/**
 * PHASE 56 — Interior REDESIGN routing gate.
 *
 * `shouldRedesignInterior` decides between the depth-locked FLUX ControlNet
 * redesign (a flat "after" photo of the SAME room) and the WorldLabs 3D-world
 * path. The contract:
 *
 *   - Interior service + an attached room photo + no explicit 3D ask → redesign.
 *   - An explicit 3D / world / walkthrough / tour request (EN/RU/KA) → NOT a
 *     redesign (falls through to WorldLabs).
 *   - A provider pin to worldlabs/marble → NOT a redesign.
 *   - No photo, or outside the Interior service → NOT a redesign.
 */

import { shouldRedesignInterior, type InteriorRoutingInput } from './interiorRouting';

const base: InteriorRoutingInput = {
  message: '',
  serviceContext: 'interior',
};

const PHOTO = 'https://cdn.example.com/room.jpg';

describe('shouldRedesignInterior — depth-locked FLUX redesign vs WorldLabs 3D', () => {
  describe('routes to REDESIGN (returns true)', () => {
    it('interior context + attached room photo + restyle prompt', () => {
      expect(
        shouldRedesignInterior({ ...base, message: 'make this a warm scandi living room', imageUrl: PHOTO }),
      ).toBe(true);
    });

    it('accepts the interior-design context alias', () => {
      expect(
        shouldRedesignInterior({ ...base, serviceContext: 'interior-design', imageUrl: PHOTO, message: 'modernize it' }),
      ).toBe(true);
    });

    it('a blind upload (contextual prompt, no explicit ask) still redesigns', () => {
      expect(shouldRedesignInterior({ ...base, message: 'ფაილი ავტვირთე', imageUrl: PHOTO })).toBe(true);
    });

    it('the photo may arrive via selectedOptions instead of imageUrl', () => {
      expect(
        shouldRedesignInterior({ ...base, message: 'restyle', selectedOptions: { image_url: PHOTO } }),
      ).toBe(true);
    });
  });

  describe('falls through to WorldLabs (returns false)', () => {
    it('no photo attached', () => {
      expect(shouldRedesignInterior({ ...base, message: 'redesign my room' })).toBe(false);
    });

    it('outside the Interior service', () => {
      expect(
        shouldRedesignInterior({ ...base, serviceContext: 'global', message: 'restyle', imageUrl: PHOTO }),
      ).toBe(false);
    });

    it('an explicit 3D / world ask routes to WorldLabs', () => {
      expect(
        shouldRedesignInterior({ ...base, message: 'turn this into a 3D world I can walk through', imageUrl: PHOTO }),
      ).toBe(false);
      expect(
        shouldRedesignInterior({ ...base, message: 'give me a virtual walkthrough', imageUrl: PHOTO }),
      ).toBe(false);
    });

    it('a Georgian 3D-world / walkthrough ask routes to WorldLabs', () => {
      expect(
        shouldRedesignInterior({ ...base, message: 'მინდა 3დ სამყარო ამ ოთახიდან', imageUrl: PHOTO }),
      ).toBe(false);
      expect(
        shouldRedesignInterior({ ...base, message: 'ვირტუალური ტური გააკეთე', imageUrl: PHOTO }),
      ).toBe(false);
    });

    it('an explicit provider pin to worldlabs/marble routes to WorldLabs', () => {
      expect(
        shouldRedesignInterior({ ...base, message: 'restyle', imageUrl: PHOTO, selectedOptions: { provider: 'worldlabs' } }),
      ).toBe(false);
      expect(
        shouldRedesignInterior({ ...base, message: 'restyle', imageUrl: PHOTO, selectedOptions: { interior_provider: 'marble' } }),
      ).toBe(false);
    });
  });
});
