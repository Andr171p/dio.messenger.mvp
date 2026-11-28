import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode === "production") {
    const env = loadEnv(mode, rootDir, "VITE_");
    for (const key of env.VITE_RUNTIME_CONFIG === "1"
      ? []
      : ["VITE_MESSENGER_API_URL", "VITE_DIODESK_API_URL", "VITE_DIODESK_WEB_URL"]) {
      const url = URL.canParse(env[key] ?? "") ? new URL(env[key]!) : null;
      if (
        !url ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname)
      ) {
        throw new Error(
          `${key} must be a non-local HTTPS origin for production builds`,
        );
      }
    }
    if (
      env.VITE_TELEMETRY_URL &&
      (!URL.canParse(env.VITE_TELEMETRY_URL) ||
        new URL(env.VITE_TELEMETRY_URL).protocol !== "https:")
    ) {
      throw new Error("VITE_TELEMETRY_URL must use HTTPS");
    }
  }

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
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
          clientsClaim: true,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [
            /^\/api(?:\/|$)/,
            /^\/v1(?:\/|$)/,
            /^\/messenger-media(?:\/|$)/,
            /\/messenger-runtime\.json$/,
          ],
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
  };
});
