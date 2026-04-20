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
    proxy: {
      "/gas": {
        target: "https://script.google.com",
        changeOrigin: true,
        secure: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/gas/, ""),
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
  },
});
