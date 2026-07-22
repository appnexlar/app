import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC no lugar do esbuild: o Nest depende de decorators com metadata
// (emitDecoratorMetadata), que o esbuild não emite.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    setupFiles: ["test/setup-env.ts"],
    // Os testes e2e compartilham o mesmo banco: nada de arquivos em paralelo.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
