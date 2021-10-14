module.exports = {
  roots: ['test/'],
  preset: 'ts-jest',
  testTimeout: 10000,
  collectCoverage: true,
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 90.94,
      statements: 91.18,
      branches: 73.77,
      functions: 94.92,
    },
  },
};
