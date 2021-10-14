module.exports = {
  roots: ['test/'],
  preset: 'ts-jest',
  testTimeout: 10000,
  collectCoverage: true,
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 90.31,
      statements: 90.49,
      branches: 73.77,
      functions: 94.55,
    },
  },
};
