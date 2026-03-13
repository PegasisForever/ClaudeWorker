import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const monitorBase = "/monitor/";
const backendOrigin = "http://localhost:13001";

export default defineConfig({
  base: monitorBase,
  plugins: [react()],
  server: {
    proxy: {
      [`${monitorBase}api/status`]: {
        target: backendOrigin,
      },
      [`${monitorBase}ws`]: {
        target: backendOrigin,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
