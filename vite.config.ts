import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GitHub Pages serwuje projekt pod /<nazwa-repo>/ — workflow ustawia VITE_BASE.
// Lokalnie (npm run dev) base to "/".
const base = process.env.VITE_BASE ?? "/";

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
  },
  build: {
    outDir: "dist",
    // Projekt jest open source — pełne sourcemapy ułatwiają diagnozę zgłoszeń
    // graczy (konsola pokazuje prawdziwe pliki źródłowe).
    sourcemap: true,
    // ~596 kB to leniwy chunk z Three.js (ładowany dopiero przy Neonowym
    // Pędzie) — poniżej tego progu ostrzeżenie o dużych chunkach nie pomaga.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // Osobne chunki vendorów => stabilne cache'owanie przez przeglądarki
        // między wydaniami (zmiany kodu aplikacji nie unieważniają Reacta/Three).
        // Forma funkcyjna, bo object-form nie dopasowuje podścieżek pakietów
        // (np. react-dom/client). scheduler jest zależnością Reacta.
        manualChunks(id: string) {
          if (id.includes("node_modules/three/")) return "three";
          if (id.includes("node_modules/peerjs/")) return "peerjs";
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) {
            return "react";
          }
        },
      },
    },
  },
});
