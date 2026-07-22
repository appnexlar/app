import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Falha na hora se a 5173 estiver ocupada, em vez de escolher uma porta
    // aleatória. Evita servidores zumbis em portas imprevisíveis.
    strictPort: true,
    proxy: {
      // Encaminha chamadas /api para a API NestJS em desenvolvimento.
      "/api": {
        target: "http://localhost:3333",
        changeOrigin: true,
      },
    },
  },
});
