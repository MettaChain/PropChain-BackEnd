module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }],
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
  ],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  testTimeout: 30000,
  passWithNoTests: true,
  testPathIgnorePatterns: ['/test/database/'],
};
