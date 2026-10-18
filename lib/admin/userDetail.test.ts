/** @jest-environment node */
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => null }));
import { markRefunds, refundRefsFor } from './userDetail';

describe('refundRefsFor', () => {
  it('accepts both refund conventions and nothing for an empty ref', () => {
    expect(refundRefsFor('video:j1')).toEqual(['video:j1', 'video:j1:refund']);
    expect(refundRefsFor('')).toEqual([]);
  });
});

describe('markRefunds', () => {
  it('marks a spend refunded by either convention, and leaves the rest refundable', () => {
    const m = markRefunds([
      { id: 'a', delta: -25, ref: 'video:j1' },
      { id: 'b', delta: 25, ref: 'video:j1:refund' },
      { id: 'c', delta: -10, ref: 'image:j2' },
      { id: 'd', delta: 10, ref: 'image:j2' },
      { id: 'e', delta: -5, ref: 'music:j3' },
      { id: 'f', delta: -5, ref: '' },
      { id: 'g', delta: 100, ref: 'bog:o1' },
    ]);
    expect(m.get('a')).toEqual({ refundable: false, refunded: true });
    expect(m.get('c')).toEqual({ refundable: false, refunded: true });
    expect(m.get('e')).toEqual({ refundable: true, refunded: false });
    expect(m.get('f')).toEqual({ refundable: false, refunded: false });
    expect(m.get('g')).toEqual({ refundable: false, refunded: false });
    expect(m.get('b')).toEqual({ refundable: false, refunded: false });
  });
});
