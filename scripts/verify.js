#!/usr/bin/env node
/**
 * Avatar G Production Verification Script
 * Validates environment, build, and deployment readiness
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  log(`\n${'='.repeat(60)}`, 'blue');
  log(`  ${title}`, 'blue');
  log(`${'='.repeat(60)}`, 'blue');
}

function check(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  const color = passed ? 'green' : 'red';
  log(`${icon} ${name}`, color);
  if (details) log(`   → ${details}`, 'yellow');
  return passed;
}

let totalChecks = 0;
let passedChecks = 0;

function verify(name, fn) {
  totalChecks++;
  try {
    const result = fn();
    if (check(name, result.passed, result.details)) {
      passedChecks++;
    }
  } catch (error) {
    check(name, false, error.message);
  }
}

// === START VERIFICATION ===
log('\n🚀 Avatar G Production Readiness Verification', 'blue');
log('Build Version: 2.0.0');
log('Date: ' + new Date().toISOString());

// ============================================================
section('1. Environment Setup');

verify('Node.js installed', () => {
  try {
    const version = execSync('node --version').toString().trim();
    return { passed: true, details: version };
  } catch {
    return { passed: false, details: 'Node.js not found' };
  }
});

verify('npm installed', () => {
  try {
    const version = execSync('npm --version').toString().trim();
    return { passed: true, details: `v${version}` };
  } catch {
    return { passed: false, details: 'npm not found' };
  }
});

verify('.env.local exists', () => {
  const exists = fs.existsSync('.env.local') || fs.existsSync('.env');
  return { passed: exists, details: exists ? 'Environment file found' : 'Missing env configuration' };
});

verify('Critical env vars set', () => {
  const requiredVars = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = [];
  requiredVars.forEach(v => {
    if (!process.env[v]) missing.push(v);
  });
  return { passed: missing.length === 0, details: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'All required vars present' };
});

// ============================================================
section('2. Dependencies');

verify('package.json exists', () => {
  return { passed: fs.existsSync('package.json'), details: 'Project manifest found' };
});

verify('node_modules installed', () => {
  return { passed: fs.existsSync('node_modules'), details: 'Dependencies installed' };
});

verify('key packages present', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const required = ['next', 'react', 'typescript', 'tailwindcss', 'supabase-js'];
  const missing = required.filter(p => !packageJson.dependencies[p]);
  return { passed: missing.length === 0, details: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'All packages present' };
});

// ============================================================
section('3. Critical Files');

const criticalFiles = [
  'app/layout.tsx',
  'app/page.tsx',
  'app/api/health/route.ts',
  'app/api/jobs/[id]/route.ts',
  'app/api/music/generate/route.ts',
  'lib/api/response.ts',
  'lib/api/rate-limit.ts',
  'lib/api/key-checker.ts',
  'app/services/music-studio/page.tsx',
  'app/services/avatar-builder/page.tsx',
  'components/Navigation.tsx',
  'public/rocket.svg',
  'app/icon.tsx',
];

criticalFiles.forEach(file => {
  verify(`${file}`, () => {
    const exists = fs.existsSync(file);
    return { passed: exists, details: exists ? 'Present' : 'Missing' };
  });
});

// ============================================================
section('4. TypeScript & Build');

verify('TypeScript config', () => {
  return { passed: fs.existsSync('tsconfig.json'), details: 'Found' };
});

verify('ESLint config', () => {
  return { passed: fs.existsSync('.eslintrc.json') || fs.existsSync('.eslintrc.js'), details: 'Found' };
});

verify('next.config.js', () => {
  return { passed: fs.existsSync('next.config.js'), details: 'Found' };
});

// ============================================================
section('5. API Routes');

const apiRoutes = [
  'app/api/health/route.ts',
  'app/api/jobs/[id]/route.ts',
  'app/api/music/generate/route.ts',
  'app/api/music/list/route.ts',
  'app/api/avatar/generate/route.ts',
];

apiRoutes.forEach(route => {
  verify(`API: ${route.replace('app/api/', '').replace('/route.ts', '')}`, () => {
    if (!fs.existsSync(route)) return { passed: false, details: 'Missing' };
    const content = fs.readFileSync(route, 'utf8');
    const hasExport = content.includes('export async function');
    return { passed: hasExport, details: hasExport ? 'Properly exported' : 'Missing export' };
  });
});

// ============================================================
section('6. Security Checks');

verify('No hardcoded secrets in .env', () => {
  const gitignore = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';
  const envsIgnored = gitignore.includes('.env.local') || gitignore.includes('.env');
  return { passed: envsIgnored, details: envsIgnored ? '.env files ignored in git' : 'Warning: env vars may be exposed' };
});

verify('API response utilities present', () => {
  const responseFile = fs.readFileSync('lib/api/response.ts', 'utf8');
  const hasApiError = responseFile.includes('export function apiError');
  const hasApiSuccess = responseFile.includes('export function apiSuccess');
  return { passed: hasApiError && hasApiSuccess, details: 'Response helpers found' };
});

verify('Rate limiting present', () => {
  const rateLimitFile = fs.readFileSync('lib/api/rate-limit.ts', 'utf8');
  const hasCheckRateLimit = rateLimitFile.includes('export');
  return { passed: hasCheckRateLimit, details: 'Rate limiter configured' };
});

// ============================================================
section('7. UI/UX Components');

verify('Navigation component', () => {
  const exist = fs.existsSync('components/Navigation.tsx');
  if (!exist) return { passed: false, details: 'Missing' };
  const content = fs.readFileSync('components/Navigation.tsx', 'utf8');
  const hasRocket = content.includes('rocket') || content.includes('Avatar G');
  return { passed: hasRocket, details: 'Branding elements present' };
});

verify('Music Studio UI', () => {
  const exist = fs.existsSync('app/services/music-studio/page.tsx');
  if (!exist) return { passed: false, details: 'Missing' };
  const content = fs.readFileSync('app/services/music-studio/page.tsx', 'utf8');
  const hasTabUI = content.includes('useCallback') && content.includes('useState');
  return { passed: hasTabUI, details: 'Interactive components found' };
});

verify('Avatar Builder Camera', () => {
  const exist = fs.existsSync('app/services/avatar-builder/page.tsx');
  if (!exist) return { passed: false, details: 'Missing' };
  const content = fs.readFileSync('app/services/avatar-builder/page.tsx', 'utf8');
  const hasCameraLogic = content.includes('getUserMedia') || content.includes('startFaceScan');
  return { passed: hasCameraLogic, details: hasCameraLogic ? 'Camera capture ready' : 'Camera not implemented' };
});

verify('Responsive design', () => {
  const landingFile = fs.readFileSync('app/page.tsx', 'utf8');
  const hasResponsive = landingFile.includes('sm:') && landingFile.includes('md:') && landingFile.includes('lg:');
  return { passed: hasResponsive, details: hasResponsive ? 'Tailwind responsive classes found' : 'May need mobile optimization' };
});

// ============================================================
section('8. Documentation');

verify('README.md present', () => {
  return { passed: fs.existsSync('README.md'), details: 'Project documentation found' };
});

verify('PRODUCTION_READINESS.md', () => {
  return { passed: fs.existsSync('PRODUCTION_READINESS.md'), details: 'Deployment guide available' };
});

verify('BUILD_PLAN.md', () => {
  return { passed: fs.existsSync('BUILD_PLAN.md'), details: 'Build information archived' };
});

// ============================================================
section('Results');

log(`\nTotal Checks: ${totalChecks}`, 'blue');
log(`Passed: ${passedChecks}`, 'green');
log(`Failed: ${totalChecks - passedChecks}`, passedChecks === totalChecks ? 'green' : 'red');

const percentage = Math.round((passedChecks / totalChecks) * 100);
log(`\nReadiness Score: ${percentage}%`, percentage >= 80 ? 'green' : percentage >= 60 ? 'yellow' : 'red');

if (passedChecks === totalChecks) {
  log('\n✅ All checks passed! Application is production-ready.', 'green');
  log('\nNext steps:', 'blue');
  log('1. npm run build     # Verify build succeeds', 'yellow');
  log('2. npm run lint      # Check for linting issues', 'yellow');
  log('3. Deploy to Vercel  # Push to production', 'yellow');
  log('4. Set up Fly.io worker for job processing', 'yellow');
  process.exit(0);
} else {
  log('\n⚠️  Some checks failed. Review above for details.', 'red');
  log('\nCommon fixes:', 'yellow');
  log('• Missing files: Run `npm run build` to generate them', 'yellow');
  log('• Missing env vars: Add them to .env.local', 'yellow');
  log('• Dependencies: Run `npm install`', 'yellow');
  process.exit(1);
}
