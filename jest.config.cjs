const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['**/?(*.)+(test).[jt]s?(x)'],
  // Never scan build output or the `.claude/worktrees` copies (isolated-agent worktrees are full repo
  // clones — scanning them doubles every suite + trips haste-map duplicate-module collisions).
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/.claude/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
};

module.exports = createJestConfig(customJestConfig);