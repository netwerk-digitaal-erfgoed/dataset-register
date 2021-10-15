module.exports = {
  roots: ['test/'],
  preset: 'ts-jest',
  testTimeout: 10000,
  collectCoverage: true,
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 92.67,
      statements: 92.83,
      branches: 82.09,
      functions: 95.08,
    },
  },
};
