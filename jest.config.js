module.exports = {
  roots: ['test/'],
  preset: 'ts-jest',
  testTimeout: 10000,
  collectCoverage: true,
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 92.36,
      statements: 92.52,
      branches: 80.76,
      functions: 95.23,
    },
  },
};
