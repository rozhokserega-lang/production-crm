import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  test: {
    environment: "jsdom",
    globals: true,
    clearMocks: true,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          utils: ["xlsx"],
        },
      },
    },
  },
  server: {
    // GAS proxy removed — CRM uses only Supabase backend.
  },
  preview: {
    port: 4173,
    host: true,
  },
});
