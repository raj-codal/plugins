// Not `stylelint.config.ts`: stylelint loads TypeScript configs through cosmiconfig, which needs the
// TypeScript compiler API that TypeScript 7 no longer ships
/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-recommended', 'stylelint-config-css-modules'],
  ignoreFiles: ['**/dist/**', '**/storybook-static/**'],
}
