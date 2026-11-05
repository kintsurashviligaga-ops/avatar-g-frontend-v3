const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  testEnvironment: 'jest-environment-jsdom',
  // Loaded AFTER the test framework so `jest.retryTimes` is available (CI-only flake auto-retry).
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  testMatch: ['**/?(*.)+(test).[jt]s?(x)'],
  // Never scan build output or the `.claude/worktrees` copies (isolated-agent worktrees are full repo
  // clones — scanning them doubles every suite + trips haste-map duplicate-module collisions).
  // pilots/ (the ADK pilot) has its own packages and its own test run (pilots/adk/jest.config.cjs).
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/.claude/', '<rootDir>/pilots/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/', '<rootDir>/pilots/'],
};

module.exports = createJestConfig(customJestConfig);