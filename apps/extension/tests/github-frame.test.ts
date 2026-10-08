import { expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { startGitHubFrame } from "../src/github-frame.js";

test("frame bridge exports the diagram, not toolbar icons, and observes late SVG updates", async () => {
  const dom = new JSDOM("<body><svg><path/></svg></body>", {
    url: "https://viewscreen.githubusercontent.com/markdown/mermaid",
  });
  const post = vi.spyOn(dom.window.parent, "postMessage").mockImplementation(() => {});
  const bridge = startGitHubFrame(dom.window.document);
  try {
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        origin: "https://github.com",
        source: dom.window.parent,
        data: { type: "mermaider:request-svg", token: "request" },
      })
    );
    expect(post).toHaveBeenCalledTimes(1); // Ready only; ignore the toolbar icon.
    const svg = dom.window.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-roledescription", "flowchart");
    svg.innerHTML = "<g><text>Original diagram</text></g>";
    dom.window.document.body.append(svg);
    await vi.waitFor(() => expect(post.mock.calls.at(-1)?.[0].svg).toContain("Original diagram"));
    expect(post.mock.calls.at(-1)?.[0].token).toBe("request");
    svg.querySelector("text")!.textContent = "Edited diagram";
    await vi.waitFor(() => expect(post.mock.calls.at(-1)?.[0].svg).toContain("Edited diagram"));
  } finally {
    bridge.stop();
    dom.window.close();
  }
});
