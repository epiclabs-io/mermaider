import { build } from "esbuild";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const app = path.join(root, "apps/extension");
const dist = path.join(root, "dist");
await mkdir(path.join(dist, "icons"), { recursive: true });
await build({
  entryPoints: [path.join(app, "src/content.ts"), path.join(app, "src/detect.ts")],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: dist,
  minify: true,
  legalComments: "linked",
});
const manifest = JSON.parse(await readFile(path.join(app, "manifest.json"), "utf8"));
const pkg = JSON.parse(await readFile(path.join(app, "package.json"), "utf8"));
manifest.version = process.env.RELEASE_VERSION ?? pkg.version;
if (
  !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version) ||
  manifest.version.split(".").some((n: string) => Number(n) > 65535)
) {
  throw new Error("Invalid Chrome extension version");
}
await writeFile(path.join(dist, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await copyFile(path.join(app, "src/content.css"), path.join(dist, "content.css"));
const svg = await readFile(path.join(app, "assets/icon.svg"));
await Promise.all(
  [16, 32, 48, 128].map((size) =>
    sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(dist, `icons/icon-${size}.png`))
  )
);
console.log(`Built Mermaider ${manifest.version} in ${dist}`);
