import { afterEach, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readGitHubBlock } from "../src/github.js";
import { readBlock, startMermaider, type RenderDiagram } from "../src/runtime.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function setup(
  render: RenderDiagram = async (_id, source) => ({ svg: `<svg><text>${source}</text></svg>` })
) {
  const dom = new JSDOM('<body><article class="markdown-body"></article></body>', {
    url: "https://github.com/example/project/issues/1",
  });
  const document = dom.window.document;
  const runtime = startMermaider({ document, render, delay: 5 });
  cleanups.push(() => {
    runtime.stop();
    dom.window.close();
  });
  function add(source: string, type = "mermaid") {
    const block = document.createElement("div");
    block.className = "js-render-enrichment-target";
    block.setAttribute("data-plain", source);
    const controls = document.createElement("div");
    controls.className = "js-render-block-actions";
    controls.textContent = "GitHub native controls";
    const target = document.createElement("div");
    target.setAttribute("data-type", type);
    const frame = document.createElement("iframe");
    frame.src = `https://viewscreen.githubusercontent.com/markdown/${type}?color_mode=light#identity`;
    frame.setAttribute("data-content", JSON.stringify({ data: source }));
    target.append(frame);
    block.append(controls, target);
    document.querySelector("article")!.append(block);
    return { block, frame, target };
  }
  return { document, add };
}

test("replaces a GitHub iframe and native toolbar with one viewer without accessing the iframe", async () => {
  const f = setup();
  const { block, frame } = f.add("graph LR\n A --> B");
  Object.defineProperty(frame, "contentDocument", {
    get() {
      throw new Error("Cross-origin access forbidden");
    },
  });
  await vi.waitFor(() => expect(f.document.querySelectorAll(".mermaider")).toHaveLength(1));
  expect(block.hasAttribute("data-mermaider-hidden")).toBe(true);
  const viewer = block.nextElementSibling!;
  expect(viewer.querySelector(".mermaider-canvas")!.textContent).toContain("A --> B");
  expect(viewer.querySelectorAll("button")).toHaveLength(4);
  viewer.querySelector<HTMLButtonElement>('[aria-label="Show source"]')!.click();
  expect(viewer.querySelector("pre")!.textContent).toBe("graph LR\n A --> B");
  expect(viewer.querySelector("pre")!.hidden).toBe(false);
});

test("extracts JSON and iframe fallback sources, tolerating malformed metadata", () => {
  const f = setup();
  const { block, frame } = f.add("sequenceDiagram\n A->>B: hello");
  block.removeAttribute("data-plain");
  block.setAttribute("data-json", JSON.stringify({ data: "graph LR\n JSON --> SOURCE" }));
  expect(readGitHubBlock(block)?.source).toContain("JSON --> SOURCE");
  block.setAttribute("data-json", "incomplete{");
  expect(readGitHubBlock(block)?.source).toContain("A->>B: hello");
  frame.setAttribute("data-content", JSON.stringify({ data: 42 }));
  expect(readGitHubBlock(block)?.source).toBe("");
});

test("unrelated GitHub embeds and spoofed iframe hosts are not replaced", async () => {
  const render = vi.fn<RenderDiagram>().mockResolvedValue({ svg: "<svg></svg>" });
  const f = setup(render);
  const { block, frame } = f.add("graph LR\n A --> B", "math");
  expect(readBlock(block).mermaid).toBe(false);
  frame.src = "https://viewscreen.githubusercontent.com.evil.example/markdown/mermaid";
  expect(readBlock(block).mermaid).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(render).not.toHaveBeenCalled();
  expect(block.hasAttribute("data-mermaider-hidden")).toBe(false);
});

test("late GitHub enrichment and edited comments rerender without duplicate viewers", async () => {
  const f = setup();
  const block = f.document.createElement("div");
  block.className = "js-render-enrichment-target";
  f.document.querySelector("article")!.append(block);
  const target = f.document.createElement("div");
  block.append(target);
  block.setAttribute("data-plain", "graph LR\n FIRST --> B");
  target.setAttribute("data-type", "mermaid");
  await vi.waitFor(() =>
    expect(f.document.querySelector(".mermaider-canvas")?.textContent).toContain("FIRST")
  );
  block.setAttribute("data-plain", "graph LR\n EDITED --> B");
  await vi.waitFor(() =>
    expect(f.document.querySelector(".mermaider-canvas")?.textContent).toContain("EDITED")
  );
  expect(f.document.querySelectorAll(".mermaider")).toHaveLength(1);
  block.remove();
  await vi.waitFor(() => expect(f.document.querySelector(".mermaider")).toBeNull());
  const second = f.add("graph LR\n NAVIGATION --> B");
  await vi.waitFor(() =>
    expect(
      second.block.nextElementSibling?.querySelector(".mermaider-canvas")?.textContent
    ).toContain("NAVIGATION")
  );
});

test("failed local rendering leaves GitHub's native widget visible", async () => {
  const render = vi.fn<RenderDiagram>().mockRejectedValue(new Error("Unsupported diagram"));
  const f = setup(render);
  const { block } = f.add("graph LR\n A[");
  await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
  expect(block.hasAttribute("data-mermaider-hidden")).toBe(false);
  expect(f.document.querySelector(".mermaider")).toBeNull();
});

test("GitHub raw Mermaid fences render once and ignore nested pre elements", async () => {
  const f = setup();
  const block = f.document.createElement("div");
  block.className = "highlight-source-mermaid";
  block.innerHTML = '<pre lang="mermaid">graph LR\n RAW --> B</pre>';
  f.document.querySelector("article")!.append(block);
  await vi.waitFor(() => expect(f.document.querySelectorAll(".mermaider")).toHaveLength(1));
  expect(f.document.querySelector(".mermaider-canvas")?.textContent).toContain("RAW --> B");
  expect(block.hasAttribute("data-mermaider-hidden")).toBe(true);
});
