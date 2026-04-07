import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react")) {
            return "react-vendor";
          }
          if (
            id.includes("@codemirror") ||
            id.includes("@uiw/react-codemirror")
          ) {
            return "editor-vendor";
          }
          if (id.includes("three/webgpu")) {
            return "viewer-webgpu";
          }
          if (id.includes("three/examples/jsm/loaders")) {
            return "viewer-loaders";
          }
          if (id.includes("three/examples/jsm/controls")) {
            return "viewer-controls";
          }
          if (id.includes("node_modules/three")) {
            return "viewer-core";
          }
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
