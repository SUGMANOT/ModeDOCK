import { chmod, mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("../src/cli/index.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/moddock.js", import.meta.url)),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: true,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
  define: { __MODDOCK_VERSION__: JSON.stringify(pkg.displayVersion ?? pkg.version) },
  legalComments: "none",
  treeShaking: true
});
if (process.platform !== "win32") await chmod(new URL("../dist/moddock.js", import.meta.url), 0o755);
console.log(`Built ModeDOCK ${pkg.displayVersion ?? pkg.version}`);
