import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Swap web-only modules for their Android versions:
 * - `routes/__root` renders a full SSR document on the web; the APK uses a
 *   plain root that mounts the app shell into `#root`.
 */
function androidOverrides(): Plugin {
  return {
    name: "sitekhata:android-overrides",
    enforce: "pre",
    async resolveId(source, importer) {
      if (source === "./routes/__root" && importer?.endsWith("routeTree.gen.ts")) {
        return here("./root.tsx");
      }
      return null;
    },
  };
}

// Static, client-only build of the app for the Android WebView shell.
// Output goes to android-app/app/src/main/assets/www (served by MainActivity).
export default defineConfig({
  root: here("."),
  base: "/",
  publicDir: false,
  resolve: {
    alias: [
      // The web preview's "download the APK" banner — pointless inside the APK.
      { find: "@/components/install-pc", replacement: here("./install-pc.tsx") },
      { find: /^@\//, replacement: here("../src/") },
    ],
  },
  plugins: [androidOverrides(), tailwindcss(), viteReact()],
  build: {
    outDir: here("../android-app/app/src/main/assets/www"),
    emptyOutDir: true,
    target: "es2020",
  },
});
