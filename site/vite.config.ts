import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/meal-plan-calculator/",
  plugins: [react()],
  root: "site",
  build: {
    outDir: "../www",
    emptyOutDir: true,
  },
});
