import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

const PWA_CACHE_VERSION = "emprestai-pwa-v2026-07-26-network-only-nav";
const ANALYZE = process.env.ANALYZE === "true";

// Identificador único do build: usado para chaves anti-loop de recuperação,
// diagnóstico e tela de recuperação. Não contém secrets.
const BUILD_ID =
  process.env.VITE_APP_BUILD_ID ||
  (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) ||
  `local-${Date.now().toString(36)}`;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  define: {
    // Injeta VERCEL_ENV do build da Vercel como VITE_VERCEL_ENV automaticamente
    // (sem precisar configurar manualmente no dashboard). Fica "production" só
    // no deploy de produção; em Preview vira "preview" e o Turnstile usa a
    // chave de teste. Fallback vazio no build local.
    "import.meta.env.VITE_VERCEL_ENV": JSON.stringify(
      process.env.VITE_VERCEL_ENV || process.env.VERCEL_ENV || ""
    ),
    "import.meta.env.VITE_APP_BUILD_ID": JSON.stringify(BUILD_ID),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    // mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: {
        enabled: false,
      },
      workbox: {
        cacheId: PWA_CACHE_VERSION,
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        // index.html NUNCA é precacheado nem cacheado em runtime: assim o HTML
        // sempre vem da rede e nunca aponta para bundles de outra versão.
        globIgnores: ["**/index.html"],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: null,
        runtimeCaching: [
          {
            // Consistência de versão > abertura offline: a navegação sempre
            // busca o HTML atual. Nada de HTML antigo servido por timeout.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/.*supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: `${PWA_CACHE_VERSION}-supabase-api`,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5,
              },
            },
          },
        ],
      },

      manifest: false, // We already have public/manifest.json
    }),
    // Bundle analysis: enabled only when ANALYZE=true, so it never affects
    // production builds, never opens a browser, and never ships at runtime.
    ANALYZE &&
      visualizer({
        filename: "dist/stats.html",
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
        open: false,
      }),
  ].filter(Boolean),
  resolve: {
    alias: [
      {
        find: /^@\/integrations\/supabase\/client$/,
        replacement: path.resolve(__dirname, "./src/integrations/supabase/userClient.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    cssCodeSplit: true,
    cssMinify: "esbuild",
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "@supabase/supabase-js",
    ],
  },
}));
