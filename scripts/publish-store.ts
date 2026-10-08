import { readFile } from "node:fs/promises";
import { publishStore } from "./store-client.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. See architecture/chrome-web-store.md`);
  }
  return value;
}

const config = {
  publisherId: required("CWS_PUBLISHER_ID"),
  extensionId: required("CWS_EXTENSION_ID"),
  clientId: required("CWS_CLIENT_ID"),
  clientSecret: required("CWS_CLIENT_SECRET"),
  refreshToken: required("CWS_REFRESH_TOKEN"),
};
const zip = await readFile(new URL("../dist/mermaider.zip", import.meta.url));
console.log(`Chrome Web Store submission state: ${await publishStore(config, zip)}`);
