import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Served from https://wigilf.github.io/Side-Quest/ — assets must resolve under
  // that subpath. Use "/" if you later move to a root domain.
  base: "/Side-Quest/",
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
});
