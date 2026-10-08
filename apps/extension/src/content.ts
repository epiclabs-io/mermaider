import mermaid from "mermaid";
import { startMermaider } from "./runtime.js";
import { startGitHubViewers } from "./github-viewers.js";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
  flowchart: { htmlLabels: false },
  suppressErrorRendering: true,
});
const render = (id: string, source: string, container: HTMLElement) =>
  mermaid.render(id, source, container);
const github = location.hostname === "github.com";
if (github) {
  startGitHubViewers({ document, render });
}
startMermaider({
  document,
  render,
  skipGitHubWidgets: github,
});
