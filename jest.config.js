module.exports = {
  roots: ['test/'],
  preset: 'ts-jest',
  testTimeout: 10000,
  collectCoverage: true,
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 92.03,
      statements: 92.2,
      branches: 80,
      functions: 93.75,
    },
  },
};
