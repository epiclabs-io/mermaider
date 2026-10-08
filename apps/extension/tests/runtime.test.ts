import { afterEach, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { startMermaider, readBlock, type RenderDiagram } from "../src/runtime.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function fixture(
  render: RenderDiagram = async (_id, source) => ({ svg: `<svg><text>${source}</text></svg>` })
) {
  const dom = new JSDOM("<!doctype html><body><main></main></body>");
  const document = dom.window.document;
  const runtime = startMermaider({ document, render, delay: 5 });
  cleanups.push(() => {
    runtime.stop();
    dom.window.close();
  });
  function add(source: string, language = "mermaid") {
    const block = document.createElement("div");
    block.className = "epitaxy-codeblock";
    block.setAttribute("data-mermaider-language", language);
    const fence = document.createElement("div");
    fence.setAttribute("data-code-text", source);
    block.append(fence);
    document.querySelector("main")!.append(block);
    return block;
  }
  function text(selector: string) {
    return document.querySelector(selector)?.textContent;
  }
  return { document, add, text };
}

test("newly mounted Mermaid blocks render and source works even with an empty code widget", async () => {
  const f = fixture();
  const block = f.add("graph LR\n A --> B");
  const other = f.add("graph LR\n C --> D", "text");
  await vi.waitFor(() => expect(f.document.querySelectorAll(".mermaider")).toHaveLength(1));
  expect(block.hasAttribute("data-mermaider-hidden")).toBe(true);
  expect(other.hasAttribute("data-mermaider-hidden")).toBe(false);
  f.document.querySelector<HTMLButtonElement>('[aria-label="Show source"]')!.click();
  expect(f.document.querySelector<HTMLPreElement>(".mermaider-source")!.hidden).toBe(false);
  expect(f.text(".mermaider-source")).toBe("graph LR\n A --> B");
  expect(f.document.querySelector<HTMLElement>(".mermaider-diagram")!.hidden).toBe(true);
  f.document.querySelector<HTMLButtonElement>('[aria-label="Show diagram"]')!.click();
  expect(f.document.querySelector<HTMLElement>(".mermaider-diagram")!.hidden).toBe(false);
});

test("streaming retains the last valid diagram, debounces updates, and recovers", async () => {
  const calls: string[] = [];
  const f = fixture(async (_id, source) => {
    calls.push(source);
    if (source.endsWith("[")) {
      throw new Error("Incomplete");
    }
    return { svg: `<svg><text>${source}</text></svg>` };
  });
  const block = f.add("graph LR\n A[");
  const fence = block.firstElementChild!;
  await vi.waitFor(() => expect(calls).toHaveLength(1));
  expect(block.hasAttribute("data-mermaider-hidden")).toBe(false);
  expect(f.document.querySelector(".mermaider")).toBeNull();
  fence.setAttribute("data-code-text", "graph LR\n A --> B");
  await vi.waitFor(() => expect(f.text(".mermaider-canvas")).toContain("A --> B"));
  const good = f.document.querySelector(".mermaider-canvas svg")!.outerHTML;
  fence.setAttribute("data-code-text", "graph LR\n C[");
  await vi.waitFor(() => expect(f.text(".mermaider-status")).toContain("previous diagram"));
  expect(f.document.querySelector(".mermaider-canvas svg")!.outerHTML).toBe(good);
  expect(f.text(".mermaider-source")).toBe("graph LR\n C[");
  fence.setAttribute("data-code-text", "graph LR\n C --> D");
  fence.setAttribute("data-code-text", "graph LR\n C --> E");
  await vi.waitFor(() => expect(f.text(".mermaider-canvas")).toContain("C --> E"));
  expect(calls).not.toContain("graph LR\n C --> D");
  expect(f.text(".mermaider-status")).toBe("");
});

test("outdated async results are discarded and concurrent renders are serialized", async () => {
  let release!: () => void;
  let inFlight = 0;
  let peak = 0;
  const f = fixture(async (_id, source) => {
    peak = Math.max(peak, ++inFlight);
    if (source.includes("OLD")) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    inFlight--;
    return { svg: `<svg><text>${source}</text></svg>` };
  });
  const block = f.add("graph LR\n OLD --> B");
  await vi.waitFor(() => expect(inFlight).toBe(1));
  block.firstElementChild!.setAttribute("data-code-text", "graph LR\n NEW --> B");
  f.add("graph LR\n SECOND --> B");
  await new Promise((resolve) => setTimeout(resolve, 20));
  release();
  await vi.waitFor(() => expect(f.document.querySelectorAll(".mermaider")).toHaveLength(2));
  expect(peak).toBe(1);
  expect(f.text(".mermaider-canvas")).toContain("NEW");
  expect(f.document.body.textContent).not.toContain("OLD");
});

test("unmounted messages clean up and render again on remount", async () => {
  const f = fixture();
  const block = f.add("graph LR\n A --> B");
  await vi.waitFor(() => expect(f.document.querySelectorAll(".mermaider")).toHaveLength(1));
  block.remove();
  await vi.waitFor(() => expect(f.document.querySelector(".mermaider")).toBeNull());
  expect(block.hasAttribute("data-mermaider-hidden")).toBe(false);
  f.document.querySelector("main")!.append(block);
  await vi.waitFor(() => expect(f.document.querySelectorAll(".mermaider")).toHaveLength(1));
});

test("standard language fences and syntax fallback are recognized without processing other languages", () => {
  const f = fixture();
  const pre = f.document.createElement("pre");
  pre.innerHTML = '<code class="language-mermaid">sequenceDiagram\n A->>B: hello</code>';
  expect(readBlock(pre).mermaid).toBe(true);
  pre.firstElementChild!.className = "language-text";
  expect(readBlock(pre).mermaid).toBe(false);
  pre.firstElementChild!.className = "";
  expect(readBlock(pre).mermaid).toBe(true);
  pre.firstElementChild!.textContent = "ordinary text";
  expect(readBlock(pre).mermaid).toBe(false);
});
