import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { zipSync, type Zippable } from "fflate";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const entries: Zippable = {};
async function collect(directory: string, prefix = ""): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) {
      await collect(path.join(directory, entry.name), `${name}/`);
    } else if (!entry.name.endsWith(".zip")) {
      entries[name] = await readFile(path.join(directory, entry.name));
    }
  }
}
await collect(dist);
await writeFile(path.join(dist, "mermaider.zip"), zipSync(entries));
console.log(`Packaged ${Object.keys(entries).length} files in dist/mermaider.zip`);
