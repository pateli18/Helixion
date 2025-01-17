import * as path from "path";
import { defineConfig, UserConfigExport } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";

const build = process.env["BUILD"] === "true";

const config: UserConfigExport = {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};

if (build) {
  config.plugins = [
    react(),
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: "helixion",
      project: "helixion-frontend",
      debug: true,
    }),
  ];
  config.build = {
    sourcemap: true,
  };
} else {
  config.plugins = [react()];
  config.server = {
    host: "127.0.0.1",
    port: 3000,
    open: "http://localhost:3000/",
    // this is required to avoid CORS requests
    proxy: {
      "/api": {
        target: "http://localhost:8000/",
        ws: true,
        changeOrigin: true,
      },
    },
  };
}
// https://vitejs.dev/config/
export default defineConfig(config);
