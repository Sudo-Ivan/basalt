// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compilerOptions } = require('../../tsconfig')

module.exports = {
  displayName: 'Frontend',

  testEnvironment: 'jsdom',

  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testPathIgnorePatterns: ['./node_modules/'],

  rootDir: '../..',

  roots: ['<rootDir>/src/frontend'],

  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true
        }
      }
    ]
  },

  moduleNameMapper: {
    '\\.(css|scss|sass|less)$': '<rootDir>/src/frontend/__mocks__/styleMock.ts',
    '\\.svg(\\?react)?$': '<rootDir>/src/frontend/__mocks__/svgMock.tsx'
  },

  setupFilesAfterEnv: ['<rootDir>/src/frontend/jest.setup.ts'],

  modulePaths: [compilerOptions.baseUrl]
}
