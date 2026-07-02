import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // .env lives at the repo root, not here in client/.
  envDir: path.resolve(dirname, ".."),
  server: {
    port: 3000,
  },
});
