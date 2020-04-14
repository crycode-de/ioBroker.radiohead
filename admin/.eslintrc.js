module.exports = {
  extends: [
    '../.eslintrc.js',
  ],
  parser: 'espree',
  parserOptions: {
    project: null
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off'
  }
};
