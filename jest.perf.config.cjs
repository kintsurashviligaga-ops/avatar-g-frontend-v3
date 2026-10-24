// The Phase 3 mock benchmarks (perf/*.perf.ts): run by `npm run perf:mock`, never by `npm test` or CI.
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'node',
  roots: ['<rootDir>/perf'],
  testMatch: ['**/*.perf.ts'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/.claude/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
});
