import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
});
