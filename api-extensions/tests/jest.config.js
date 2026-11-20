const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname, '../..'),
  testRegex: 'api-extensions/tests/.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }],
  },
  testEnvironment: 'node',
  testTimeout: 30000,
  collectCoverageFrom: [
    'api-extensions/**/*.ts',
    '!api-extensions/**/*.module.ts',
    '!api-extensions/**/*.dto.ts',
    '!api-extensions/tests/**',
    '!api-extensions/scripts/**',
  ],
};
