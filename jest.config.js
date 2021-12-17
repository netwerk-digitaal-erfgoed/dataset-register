export default {
  roots: ['test/'],
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: false,
    },
  },
  preset: 'ts-jest/presets/default-esm',
  testTimeout: 10000,
  collectCoverage: true,
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 95.84,
      statements: 95.93,
      branches: 81.81,
      functions: 100,
    },
  },
  transform: {},
};
