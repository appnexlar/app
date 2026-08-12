/*
 * Configuração de lint da API Nextlar (NestJS + TS sobre Node).
 *
 * Espelha a do front (apps/web) no que é comum: mesmo parser, mesma base
 * recomendada, mesmo tratamento de variável não usada. O que muda é só o
 * ambiente, aqui é Node e não navegador, e a ausência dos plugins de React.
 */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    // Nome começado com _ é descarte deliberado, não esquecimento. Vale para
    // argumento e para variável, inclusive a que sobra de desestruturação.
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
    // O espaço não separável é escolha tipográfica nossa, e não sujeira:
    // segura "120 m²" e "R$ 350 mil" na mesma linha.
    "no-irregular-whitespace": ["error", { skipTemplates: true }],
  },
  ignorePatterns: ["dist", "node_modules", "*.config.ts", "*.config.js", "scripts"],
};
