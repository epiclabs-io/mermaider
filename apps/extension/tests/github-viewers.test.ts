import { expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { startGitHubViewers } from "../src/github-viewers.js";
import type { RenderDiagram } from "../src/runtime.js";

const NATIVE =
  '<svg xmlns="http://www.w3.org/2000/svg" id="github-diagram" viewBox="0 0 880 990"><defs><marker id="arrow"><path d="M0 0L5 5"/></marker></defs><text>GitHub native labels</text></svg>';
function fixture(
  render = vi
    .fn<RenderDiagram>()
    .mockResolvedValue({ svg: '<svg viewBox="0 0 500 100"><text>Mermaider labels</text></svg>' })
) {
  const dom = new JSDOM(
    '<body><div class="js-render-enrichment-target" data-plain="graph LR&#10; A --> B"><div data-type="mermaid"><iframe src="https://viewscreen.githubusercontent.com/markdown/mermaid"></iframe></div></div></body>',
    { url: "https://github.com/org/repo/issues/1" }
  );
  const document = dom.window.document;
  const block = document.querySelector<HTMLElement>(".js-render-enrichment-target")!;
  const frame = block.querySelector("iframe")!;
  frame.getBoundingClientRect = () => ({ height: 990, width: 880 }) as DOMRect;
  const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
  const runtime = startGitHubViewers({ document, render });
  const token = () => post.mock.calls.at(-1)![0].token as string;
  function snapshot(
    svg = NATIVE,
    options: { origin?: string; token?: string; source?: Window; refreshed?: boolean } = {}
  ) {
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        origin: options.origin ?? "https://viewscreen.githubusercontent.com",
        source: options.source ?? frame.contentWindow!,
        data: {
          type: "mermaider:github-svg",
          token: options.token ?? token(),
          svg,
          height: 990,
          refreshed: options.refreshed,
        },
      })
    );
  }
  const viewer = () => document.querySelector<HTMLElement>(".mermaider")!;
  const native = () =>
    viewer().querySelector(".mermaider-canvas > div")?.shadowRoot?.querySelector("svg");
  return {
    dom,
    document,
    block,
    frame,
    post,
    render,
    token,
    snapshot,
    viewer,
    native,
    close() {
      runtime.stop();
      dom.window.close();
    },
  };
}

test("GitHub SVG is the default, with the original 990px diagram height and no local rerender", () => {
  const f = fixture();
  try {
    expect(f.block.hasAttribute("data-mermaider-hidden")).toBe(false);
    f.snapshot();
    expect(f.native()?.textContent).toContain("GitHub native labels");
    expect(
      f
        .viewer()
        .querySelector<HTMLElement>(".mermaider-diagram")!
        .style.getPropertyValue("--mermaider-height")
    ).toBe("990px");
    expect(f.viewer().querySelectorAll("button")).toHaveLength(5);
    expect(f.render).not.toHaveBeenCalled();
    expect(f.block.hasAttribute("data-mermaider-hidden")).toBe(true);
  } finally {
    f.close();
  }
});

test("renderer toggle keeps the same viewport and switches back to the cached original SVG", async () => {
  const f = fixture();
  try {
    f.snapshot();
    f.viewer().querySelector<HTMLButtonElement>('[aria-label="Use Mermaider SVG"]')!.click();
    await vi.waitFor(() =>
      expect(f.viewer().querySelector(".mermaider-canvas svg")?.textContent).toBe(
        "Mermaider labels"
      )
    );
    expect(
      f
        .viewer()
        .querySelector<HTMLElement>(".mermaider-diagram")!
        .style.getPropertyValue("--mermaider-height")
    ).toBe("990px");
    f.viewer().querySelector<HTMLButtonElement>('[aria-label="Use GitHub SVG"]')!.click();
    expect(f.native()?.textContent).toContain("GitHub native labels");
    f.viewer().querySelector<HTMLButtonElement>('[aria-label="Use Mermaider SVG"]')!.click();
    expect(f.render).toHaveBeenCalledTimes(1);
  } finally {
    f.close();
  }
});

test("renderer failure restores GitHub SVG and retains navigation", async () => {
  const f = fixture(vi.fn<RenderDiagram>().mockRejectedValue(new Error("Unsupported")));
  try {
    f.snapshot();
    f.viewer().querySelector<HTMLButtonElement>('[aria-label="Use Mermaider SVG"]')!.click();
    await vi.waitFor(() =>
      expect(f.viewer().querySelector(".mermaider-status")?.textContent).toContain(
        "using GitHub SVG"
      )
    );
    expect(f.native()?.textContent).toContain("GitHub native labels");
  } finally {
    f.close();
  }
});

test("rejects foreign origins, unrelated frames and old tokens, and sanitizes SVG with HTML labels", () => {
  const f = fixture();
  try {
    f.snapshot(NATIVE, { origin: "https://evil.example" });
    f.snapshot(NATIVE, { source: f.dom.window as unknown as Window });
    f.snapshot(NATIVE, { token: "outdated" });
    expect(f.document.querySelector(".mermaider")).toBeNull();
    f.snapshot(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 990"><script>alert(1)</script><foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml" onclick="alert(1)">Native HTML label</div></foreignObject></svg>'
    );
    expect(f.native()?.querySelector("script")).toBeNull();
    expect(f.native()?.querySelector("foreignObject")).not.toBeNull();
    expect(f.native()?.querySelector("[onclick]")).toBeNull();
    expect(f.native()?.textContent).toContain("Native HTML label");
  } finally {
    f.close();
  }
});

test("edited source invalidates cached renderers and old snapshots; navigation cleans up", async () => {
  const f = fixture();
  try {
    f.snapshot();
    const old = f.token();
    f.block.setAttribute("data-plain", "graph LR\n EDITED --> B");
    await vi.waitFor(() => expect(f.token()).not.toBe(old));
    f.snapshot(NATIVE, { token: old });
    f.snapshot(NATIVE);
    expect(f.viewer().querySelector(".mermaider-status")?.textContent).toContain("Updating");
    f.snapshot(NATIVE.replace("native labels", "edited labels"));
    expect(f.native()?.textContent).toContain("edited labels");
    expect(f.viewer().querySelector("pre")?.textContent).toContain("EDITED");
    f.block.remove();
    await vi.waitFor(() => expect(f.document.querySelector(".mermaider")).toBeNull());
  } finally {
    f.close();
  }
});
