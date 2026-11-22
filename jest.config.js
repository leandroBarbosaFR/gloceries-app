/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/ios',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  clearMocks: true,
};
