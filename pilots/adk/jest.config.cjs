/**
 * The ADK pilot's own test run (MASTER TASK v3.1 Phase 5). It reuses the app's next/jest transform from the repo
 * root, so `@/lib/...` resolves exactly as in the app, but runs only pilots/adk and in node: @google/adk lives in
 * pilots/adk/node_modules and nowhere in the app's tree. The root jest config ignores pilots/.
 */
const path = require('path');
const nextJest = require('next/jest');

const root = path.resolve(__dirname, '../..');
const createJestConfig = nextJest({ dir: root });

const base = createJestConfig({
  rootDir: root,
  roots: ['<rootDir>/pilots/adk/src'],
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(test).ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
});

// ADK's CommonJS build requires lodash-es, which ships only as ES modules. Node 22+ loads that natively; jest's
// module runtime does not, so lodash-es (and only it) goes through the same SWC transform as our own code.
const ESM_ONLY = ['lodash-es'];
module.exports = async () => {
  const config = await base();
  config.transformIgnorePatterns = [`/node_modules/(?!(${ESM_ONLY.join('|')})/)`, '^.+\\.module\\.(css|sass|scss)$'];
  return config;
};
