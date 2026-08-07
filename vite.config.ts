import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { cssClassObfuscator } from "./vite/cssClassObfuscator";

export default defineConfig({
  plugins: [
    react(),
    // Hybrid: Lightning CSS minifies; this remaps class names in the final
    // CSS/JS assets. (postcss-obfuscator can't — it rewrites a copy under
    // `out/` while Vite still bundles `src/`.)
    cssClassObfuscator({
      emitMap: process.env.CSS_CLASS_MAP === "1",
    }),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "three"],
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
  },
  build: {
    target: "es2022",
    // Keep Lightning CSS for speed. Pair with webkit-first `backdrop-filter`
    // in styles.css so the unprefixed property is preserved (lightningcss#1229).
    cssMinify: "lightningcss",
    sourcemap: false,
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
