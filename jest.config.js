export default {
  preset: 'ts-jest/presets/default-esm',
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
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
      lines: 69.81,
      statements: 69.6,
      branches: 60.36,
      functions: 69.23,
    },
  },
  transform: {},
};
