#!/usr/bin/env node

/**
 * Avatar G Production Test Suite
 * Verify all critical systems are working
 * 
 * Usage: npx ts-node scripts/production-test.ts
 * Or:    node scripts/production-test.js (if compiled)
 */

const baseUrl = process.env.TEST_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  duration: number;
}

const results: TestResult[] = [];

function log(level: 'INFO' | 'PASS' | 'FAIL' | 'WARN', msg: string) {
  const colors = {
    INFO: '\x1b[36m', // cyan
    PASS: '\x1b[32m', // green
    FAIL: '\x1b[31m', // red
    WARN: '\x1b[33m', // yellow
  };
  const reset = '\x1b[0m';
  console.log(`${colors[level]}[${level}]${reset} ${msg}`);
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, status: 'PASS', message: 'Success', duration });
    log('PASS', `${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: 'FAIL', message, duration });
    log('FAIL', `${name}: ${message} (${duration}ms)`);
  }
}

async function testHealthEndpoint() {
  await test('GET /api/health', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    if (!data.ok && data.redis !== 'unconfigured') {
      throw new Error(`Health check failed: ${data.message}`);
    }
    
    log('INFO', `  Redis status: ${data.redis}`);
  });
}

async function testChatEndpoint() {
  const contexts = ['global', 'avatar', 'music', 'video'];
  
  for (const context of contexts) {
    await test(`POST /api/chat (${context})`, async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          context,
        }),
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      if (!data.response) throw new Error('No response text');
      
      log('INFO', `  Provider: ${data.provider}, Context: ${data.context}`);
    });
  }
}

async function testPages() {
  const pages = [
    { path: '/', name: 'Home' },
    { path: '/services/avatar-builder', name: 'Avatar Builder' },
    { path: '/services/music-studio', name: 'Music Studio' },
    { path: '/services/media-production', name: 'Video Studio' },
  ];
  
  for (const page of pages) {
    await test(`GET ${page.path} (${page.name})`, async () => {
      const res = await fetch(`${baseUrl}${page.path}`, {
        redirect: 'follow',
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const html = await res.text();
      
      // Check for deploy marker on home page
      if (page.path === '/' && !html.includes('DEPLOY_MARKER')) {
        log('WARN', '  Deploy marker not found in HTML');
      }
      
      // Check for ChatWindow on service pages
      if (page.path !== '/' && !html.includes('ChatWindow')) {
        log('WARN', `  ChatWindow not found in page HTML`);
      }
    });
  }
}

async function testDeployMarker() {
  await test('Deploy Marker Visibility', async () => {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    
    if (!html.includes('DEPLOY_MARKER_2026-02-12')) {
      throw new Error('Deploy marker not visible on homepage');
    }
    
    log('INFO', '  Deploy marker detected: DEPLOY_MARKER_2026-02-12_v1');
  });
}

async function testRateLimiting() {
  await test('Rate Limiting', async () => {
    // Send 5 requests rapidly
    const requests = Array(5)
      .fill(null)
      .map(() =>
        fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Test',
            context: 'global',
          }),
        })
      );
    
    const responses = await Promise.all(requests);
    const statuses = responses.map(r => r.status);
    
    // Should get some 200s and possibly a 429 (rate limited)
    const hasValidResponses = statuses.some(s => s === 200);
    const hasRateLimit = statuses.some(s => s === 429);
    
    if (!hasValidResponses) throw new Error('No valid responses');
    
    if (hasRateLimit) {
      log('INFO', '  Rate limiting is active (got 429)');
    } else {
      log('WARN', '  No rate limiting detected (expected for low concurrency)');
    }
  });
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('Avatar G Production Test Suite');
  console.log('Base URL: ' + baseUrl);
  console.log('='.repeat(60) + '\n');
  
  // Run test suites
  log('INFO', 'Testing Health Endpoint...');
  await testHealthEndpoint();
  
  log('INFO', '\nTesting Pages...');
  await testPages();
  
  log('INFO', '\nTesting Deploy Marker...');
  await testDeployMarker();
  
  log('INFO', '\nTesting Chat API...');
  await testChatEndpoint();
  
  log('INFO', '\nTesting Rate Limiting...');
  await testRateLimiting();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Results Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Warned: ${warned}`);
  console.log(`Total: ${results.length}`);
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    results
      .filter(r => r.status === 'FAIL')
      .forEach(r => {
        log('FAIL', `  ${r.name}: ${r.message}`);
      });
  }
  
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\nTotal Duration: ${totalDuration}ms`);
  console.log('='.repeat(60) + '\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log('FAIL', `Test suite error: ${error}`);
  process.exit(1);
});
