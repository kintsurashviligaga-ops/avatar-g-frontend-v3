/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));
import { ownedLocation } from './live';

describe('ownedLocation', () => {
  it('reads only the caller\'s own uploads and Art Director results', () => {
    expect(ownedLocation('u1/a.png', 'u1')).toEqual({ bucket: 'uploads', path: 'u1/a.png' });
    expect(ownedLocation('omni-uploads/u1/a.png', 'u1')?.bucket).toBe('uploads');
    expect(ownedLocation('art-director/u1/x.png', 'u1')).toEqual({ bucket: 'renders', path: 'art-director/u1/x.png' });
    expect(ownedLocation('u2/a.png', 'u1')).toBeNull();
    expect(ownedLocation('art-director/u2/x.png', 'u1')).toBeNull();
    expect(ownedLocation('art-director/u1/../u2/x.png', 'u1')).toBeNull();
  });
});
