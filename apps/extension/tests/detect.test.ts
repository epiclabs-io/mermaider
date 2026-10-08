import { expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { startLanguageDetector } from "../src/detect.js";

test("fence metadata is detected on mount and changes during streaming", async () => {
  const dom = new JSDOM("<body><main></main></body>");
  const detector = startLanguageDetector(dom.window.document);
  try {
    const block = dom.window.document.createElement("div");
    block.className = "epitaxy-codeblock";
    const props = { rawLang: "mermaid", text: "graph LR" };
    Object.assign(block, {
      __reactFiber$test: { memoizedProps: {}, return: { memoizedProps: props } },
    });
    const fence = dom.window.document.createElement("div");
    fence.setAttribute("data-code-text", "graph LR");
    block.append(fence);
    dom.window.document.querySelector("main")!.append(block);
    await vi.waitFor(() => expect(block.getAttribute("data-mermaider-language")).toBe("mermaid"));
    props.rawLang = "typescript";
    fence.setAttribute("data-code-text", "const x = 1");
    await vi.waitFor(() =>
      expect(block.getAttribute("data-mermaider-language")).toBe("typescript")
    );
  } finally {
    detector.stop();
    dom.window.close();
  }
});
