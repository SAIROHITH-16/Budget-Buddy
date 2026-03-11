import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Proxy /api requests to the Express backend during local development.
    // This means you don't need VITE_API_URL set in .env for dev.
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router-dom")) {
              return "react-vendor";
            }
            if (id.includes("firebase")) {
              return "firebase-vendor";
            }
            if (id.includes("pdfjs-dist")) {
              return "pdf-vendor";
            }
            if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("recharts")) {
              return "ui-vendor";
            }
            return "vendor";
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
