import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

/** When Vercel builds without VITE_MANUAL_API_URL, the bundle otherwise falls back to localhost and breaks production. Override anytime with VITE_MANUAL_API_URL in Vercel env. */
/** Must match your Render Web Service URL (see Render dashboard). Override with VITE_MANUAL_API_URL if you use another host. */
const DEFAULT_MANUAL_API_FOR_VERCEL_PROD = "https://lab-record-system-moy2.onrender.com";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const fromEnv = String(
    env.VITE_MANUAL_API_URL || process.env.VITE_MANUAL_API_URL || ""
  ).trim();
  const useVercelDefault =
    mode === "production" &&
    process.env.VERCEL === "1" &&
    !fromEnv;
  const viteManualApi = fromEnv || (useVercelDefault ? DEFAULT_MANUAL_API_FOR_VERCEL_PROD : "");

  return {
  plugins: [
    react(),
    visualizer({
      filename: "stats.html",
      gzipSize: true,
      open: false,
    }),
  ],
  base: "/", // required for Vercel SPA
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@context": path.resolve(__dirname, "./src/context"),
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          router: ["react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
  server: {
    allowedHosts: [".ngrok-free.dev", ".ngrok.app", ".ngrok.io"],
    hmr: {
      overlay: false,
    },
  },
  define: {
    "import.meta.env.VITE_MANUAL_API_URL": JSON.stringify(viteManualApi),
  },
};
});
