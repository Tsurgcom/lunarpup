import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { cssClassObfuscator } from "./vite/cssClassObfuscator";

const root = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);

export default defineConfig({
  // Prevent Vite from obscuring Rust errors in the terminal.
  clearScreen: false,
  plugins: [
    react(),
    // Hybrid: Lightning CSS minifies; this remaps class names in the final
    // CSS/JS assets. (postcss-obfuscator can't — it rewrites a copy under
    // `out/` while Vite still bundles `src/`.)
    cssClassObfuscator({
      emitMap: process.env.CSS_CLASS_MAP === "1",
    }),
  ],
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  resolve: {
    // v1/v2 archives ship their own node_modules; without dedupe Vite can
    // pair root `react` with archive `react-dom` → invalid hook call.
    dedupe: ["react", "react-dom", "three"],
    alias: {
      react: path.resolve(root, "node_modules/react"),
      "react-dom": path.resolve(root, "node_modules/react-dom"),
      three: path.resolve(root, "node_modules/three"),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "three",
      "@react-three/fiber",
      "@react-three/drei",
    ],
  },
  server: {
    port: 3000,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 3001,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    fs: {
      // Don't serve archive deps as app modules.
      deny: ["**/v1/node_modules/**", "**/v2/node_modules/**"],
    },
  },
  build: {
    // Browser builds stay on es2022; Tauri WebViews need older targets.
    target: isTauriBuild
      ? process.env.TAURI_ENV_PLATFORM === "windows"
        ? "chrome105"
        : "safari13"
      : "es2022",
    // Keep Lightning CSS for speed. Pair with webkit-first `backdrop-filter`
    // in styles.css so the unprefixed property is preserved (lightningcss#1229).
    cssMinify: "lightningcss",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    reportCompressedSize: false,
    // The `three` chunk (~725 kB min) can't be split: R3F imports the whole
    // THREE namespace and the game needs it at startup. It's isolated into
    // its own cacheable chunk below, so just raise the warning threshold.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Keep react + react-dom in one chunk so they share one instance.
            {
              name: "react",
              test: /node_modules\/(react|react-dom)\//,
            },
            { name: "three", test: /node_modules\/three\// },
            {
              name: "r3f",
              test: /node_modules\/@react-three\//,
            },
            {
              name: "trystero",
              test: /node_modules\/@trystero/,
            },
          ],
        },
      },
    },
  },
});
