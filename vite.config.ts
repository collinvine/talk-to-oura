import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cartographer } from "@replit/vite-plugin-cartographer";
import runtimeErrorModal from "@replit/vite-plugin-runtime-error-modal";
import { devBanner } from "@replit/vite-plugin-dev-banner";

export default defineConfig({
  root: path.resolve(__dirname, "client"),
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorModal(),
    cartographer(),
    devBanner(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
