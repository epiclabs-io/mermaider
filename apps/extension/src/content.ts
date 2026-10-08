import mermaid from "mermaid";
import { startMermaider } from "./runtime.js";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
  flowchart: { htmlLabels: false },
  suppressErrorRendering: true,
});
startMermaider({
  document,
  render: (id, source, container) => mermaid.render(id, source, container),
});
