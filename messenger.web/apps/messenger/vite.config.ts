import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "DIO Messenger",
        short_name: "Messenger",
        theme_color: "#222222",
        background_color: "#222222",
        display: "standalone",
        start_url: "/",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
    }),
  ],
  resolve: {
    alias: [
      {
        find: "@dio/messenger-ui/tokens.css",
        replacement: path.resolve(
          rootDir,
          "../../packages/messenger-ui/src/tokens/tokens.css",
        ),
      },
      {
        find: "@dio/messenger-core",
        replacement: path.resolve(
          rootDir,
          "../../packages/messenger-core/src/index.ts",
        ),
      },
      {
        find: "@dio/messenger-ui",
        replacement: path.resolve(
          rootDir,
          "../../packages/messenger-ui/src/index.ts",
        ),
      },
    ],
  },
  server: {
    port: 5173,
  },
});