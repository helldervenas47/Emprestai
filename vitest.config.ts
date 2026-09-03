import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Módulo virtual gerado pelo vite-plugin-pwa (não existe em teste).
      "virtual:pwa-register": path.resolve(__dirname, "./src/test/mocks/pwaRegister.ts"),
    },
  },
});
