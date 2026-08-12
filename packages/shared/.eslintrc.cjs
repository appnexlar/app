/*
 * Configuração de lint do pacote compartilhado (TypeScript puro).
 *
 * Este pacote roda nos dois lados, navegador e servidor, então não declara
 * nem um ambiente nem o outro: código que dependesse de `window` ou de
 * `process` aqui seria justamente o erro que se quer pegar.
 */
module.exports = {
  root: true,
  env: { es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
    "no-irregular-whitespace": ["error", { skipTemplates: true }],
  },
  ignorePatterns: ["dist", "node_modules"],
};
