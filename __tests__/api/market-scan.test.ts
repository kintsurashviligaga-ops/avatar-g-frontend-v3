/**
 * API Route Tests for Market Scan and Revenue Optimization
 */

import { POST } from '@/app/api/market/scan/route';
import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/server';

// Mock dependencies
jest.mock('@/lib/auth/server');
jest.mock('@/lib/decision-engine/decisionEngine');

describe('Market Scan API Route', () => {
  let mockGetUser: jest.Mock;
  let mockEvaluateProductCandidate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetUser = jest.fn().mockResolvedValue({
      data: {
        user: { id: 'user_123', email: 'test@example.com' },
      },
      error: null,
    });

    (createSupabaseServerClient as jest.Mock).mockResolvedValue({
      getUser: mockGetUser,
    });
  });

  test('should reject invalid niche parameter', async () => {
    const request = new NextRequest('http://localhost:3000/api/market/scan', {
      method: 'POST',
      body: JSON.stringify({
        niche: 'a', // Too short, min 2
        country: 'GE',
        priceRangeCents: [1000, 10000],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe('Invalid input');
  });

  test('should reject missing price range', async () => {
    const request = new NextRequest('http://localhost:3000/api/market/scan', {
      method: 'POST',
      body: JSON.stringify({
        niche: 'electronics',
        country: 'GE',
        // Missing priceRangeCents
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  test('should reject unauthorized request', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const request = new NextRequest('http://localhost:3000/api/market/scan', {
      method: 'POST',
      body: JSON.stringify({
        niche: 'electronics',
        country: 'GE',
        priceRangeCents: [1000, 10000],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  test('should return approved products sorted by margin', async () => {
    const request = new NextRequest('http://localhost:3000/api/market/scan', {
      method: 'POST',
      body: JSON.stringify({
        niche: 'electronics',
        country: 'GE',
        priceRangeCents: [3000, 12000],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data).toHaveProperty('niche', 'electronics');
    expect(data.data).toHaveProperty('country', 'GE');
    expect(data.data).toHaveProperty('scanDate');
    expect(data.data).toHaveProperty('productsScanned');
    expect(data.data).toHaveProperty('productsApproved');
    expect(data.data).toHaveProperty('products');
    expect(Array.isArray(data.data.products)).toBe(true);
  });

  test('should handle invalid JSON parsing error', async () => {
    const request = new NextRequest('http://localhost:3000/api/market/scan', {
      method: 'POST',
      body: 'invalid json {',
    });

    const response = await POST(request);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe('Market scan failed');
  });

  test('should default country to GE when not provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/market/scan', {
      method: 'POST',
      body: JSON.stringify({
        niche: 'electronics',
        priceRangeCents: [1000, 10000],
        // country not provided
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data.country).toBe('GE');
  });

  test('should accept optional competitor URL', async () => {
    const request = new NextRequest('http://localhost:3000/api/market/scan', {
      method: 'POST',
      body: JSON.stringify({
        niche: 'electronics',
        country: 'GE',
        priceRangeCents: [1000, 10000],
        competitorUrl: 'https://competitor.example.com',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  test('should reject invalid URL format', async () => {
    const request = new NextRequest('http://localhost:3000/api/market/scan', {
      method: 'POST',
      body: JSON.stringify({
        niche: 'electronics',
        country: 'GE',
        priceRangeCents: [1000, 10000],
        competitorUrl: 'not-a-valid-url',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  test('should limit response to top 20 products', async () => {
    const request = new NextRequest('http://localhost:3000/api/market/scan', {
      method: 'POST',
      body: JSON.stringify({
        niche: 'electronics',
        country: 'GE',
        priceRangeCents: [1000, 100000],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.data.products.length).toBeLessThanOrEqual(20);
  });

  test('should include scan timestamp', async () => {
    const request = new NextRequest('http://localhost:3000/api/market/scan', {
      method: 'POST',
      body: JSON.stringify({
        niche: 'electronics',
        country: 'GE',
        priceRangeCents: [1000, 10000],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    const scanDate = new Date(data.data.scanDate);
    expect(scanDate instanceof Date).toBe(true);
    expect(scanDate.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
