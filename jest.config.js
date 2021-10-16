module.exports = {
  roots: ['test/'],
  preset: 'ts-jest',
  testTimeout: 10000,
  collectCoverage: true,
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 92.31,
      statements: 92.47,
      branches: 81.16,
      functions: 95.08,
    },
  },
};
