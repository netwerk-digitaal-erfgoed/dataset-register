export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testTimeout: 10000,
  collectCoverage: true,
  collectCoverageFrom: [
    '**/src/**/*.ts', // Include files that are not covered by tests.
    '!**/src/**/*.d.ts', // Don't show d.ts files on code coverage overview.
  ],
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 70.43,
      statements: 70.66,
      branches: 64.56,
      functions: 67.67,
    },
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
