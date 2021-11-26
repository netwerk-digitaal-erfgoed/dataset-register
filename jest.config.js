module.exports = {
  roots: ['test/'],
  preset: 'ts-jest',
  testTimeout: 10000,
  collectCoverage: true,
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 94.82,
      statements: 94.94,
      branches: 81.13,
      functions: 98.46,
    },
  },
};
