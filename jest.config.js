module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // 覆盖率统计：宽基线 + 只配排除。
  // 未来新增的 packages/* 下的源码会自动纳入 100% 约束（无测试即 0%，提交被拦截）。
  collectCoverageFrom: [
    'packages/**/*.{ts,tsx,js,jsx,cjs,mjs}',
    '!packages/pkg-cli/**',
    '!packages/*/example/**',
    '!packages/*/*.config.{ts,js}',
    '!**/*.d.ts',
    '!**/tests/**',
    '!**/__tests__/**',
    '!**/*.test.*',
    '!**/dist/**',
  ],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};
