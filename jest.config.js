/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.integration.test.js'],
  clearMocks: true,
  verbose: true,
  forceExit: true,
  testTimeout: 10000
};
