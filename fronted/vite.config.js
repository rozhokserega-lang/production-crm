import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // For local dev we often need to bypass browser CORS to Supabase.
  // We do this by letting the browser call the same-origin path (/supabase/...)
  // and Vite forwards it server-side to the real Supabase proxy.
  const env = loadEnv(mode, process.cwd(), "");
  const prodEnv = loadEnv("production", process.cwd(), "");
  const proxyBase = String(env.VITE_SUPABASE_PROXY_URL || "").trim();
  const proxyTarget = String(env.VITE_SUPABASE_PROXY_TARGET_URL || env.VITE_SUPABASE_PROXY_TARGET || env.VITE_SUPABASE_URL || "").trim();

  const shouldUseLocalSupabaseProxy = proxyBase === "/supabase" && proxyTarget;

  return {
  plugins: [react()],
  base: "/",
  test: {
    environment: "jsdom",
    globals: true,
    clearMocks: true,
    // Подмешиваем .env.production, чтобы на VPS vitest видел VITE_* (есть только в этом файле).
    // TZ фиксирует calcWorkingMsBetween/stageTime.test (календарный день).
    env: {
      ...prodEnv,
      ...env,
      TZ: "Europe/Moscow",
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "vendor-react";
          }
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory")) {
            return "vendor-charts";
          }
          if (id.includes("xlsx") || id.includes("SheetJS")) {
            return "vendor-xlsx";
          }
          if (id.includes("@supabase")) {
            return "vendor-supabase";
          }
        },
      },
    },
  },
  server: {
    // GAS proxy removed — CRM uses only Supabase backend.
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: ["crm-v175.ru", "www.crm-v175.ru"],
    ...(shouldUseLocalSupabaseProxy
      ? {
          proxy: {
            "/supabase": {
              target: proxyTarget,
              changeOrigin: true,
              secure: true,
              rewrite: (path) => path.replace(/^\/supabase/, ""),
            },
          },
        }
      : {}),
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: ["crm-v175.ru", "www.crm-v175.ru"],
  },
  };
});
