import { expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { createViewer } from "../src/viewer.js";

function setup() {
  const dom = new JSDOM('<body><div id="block"><diffs-container></diffs-container></div></body>');
  const block = dom.window.document.querySelector<HTMLElement>("#block")!;
  const v = createViewer(dom.window.document, block);
  v.mount();
  v.updateSource("graph LR\n A --> B");
  v.setSVG('<svg viewBox="0 0 200 100"></svg>');
  return {
    dom,
    block,
    v,
    close() {
      v.destroy();
      dom.window.close();
    },
  };
}

test("wheel zoom anchors at the cursor and only left-button drag pans", () => {
  const f = setup();
  try {
    const { WheelEvent, MouseEvent } = f.dom.window;
    const canvas = f.v.ui.querySelector<HTMLElement>(".mermaider-canvas")!;
    const numbers = () => canvas.style.transform.match(/-?[\d.]+/g)!.map(Number);
    const [x, y, scale] = numbers();
    const event = new WheelEvent("wheel", {
      deltaY: -100,
      clientX: 100,
      clientY: 100,
      cancelable: true,
    });
    f.v.diagram.dispatchEvent(event);
    const [zx, zy, zs] = numbers();
    expect(event.defaultPrevented).toBe(true);
    expect(zs).toBeGreaterThan(scale);
    expect((100 - zx) / zs).toBeCloseTo((100 - x) / scale);
    expect((100 - zy) / zs).toBeCloseTo((100 - y) / scale);
    f.v.diagram.dispatchEvent(new MouseEvent("pointerdown", { button: 2, clientX: 10 }));
    f.v.diagram.dispatchEvent(new MouseEvent("pointermove", { clientX: 40 }));
    expect(numbers()).toEqual([zx, zy, zs]);
    f.v.diagram.dispatchEvent(
      new MouseEvent("pointerdown", { button: 0, clientX: 10, clientY: 10 })
    );
    f.v.diagram.dispatchEvent(new MouseEvent("pointermove", { clientX: 40, clientY: 50 }));
    expect(numbers()).toEqual([zx + 30, zy + 40, zs]);
    f.v.diagram.dispatchEvent(new MouseEvent("pointerup"));
    expect(f.v.diagram.classList.contains("mermaider-dragging")).toBe(false);
  } finally {
    f.close();
  }
});

test("source icon displays live text independent of the original widget", () => {
  const f = setup();
  try {
    const toggle = f.v.ui.querySelector<HTMLButtonElement>('[aria-label="Show source"]')!;
    toggle.click();
    const source = f.v.ui.querySelector("pre")!;
    expect(source.hidden).toBe(false);
    expect(source.textContent).toBe("graph LR\n A --> B");
    expect(toggle.textContent).toBe("");
    f.v.updateSource("graph LR\n A --> C");
    expect(source.textContent).toBe("graph LR\n A --> C");
  } finally {
    f.close();
  }
});

test("maximization restores its original location and teardown removes the modal", () => {
  const f = setup();
  try {
    const prototype = f.dom.window.HTMLDialogElement.prototype;
    prototype.showModal = function () {
      this.open = true;
    };
    prototype.close = function () {
      this.open = false;
      this.dispatchEvent(new f.dom.window.Event("close"));
    };
    f.v.ui.querySelector<HTMLButtonElement>('[aria-label="Maximize diagram"]')!.click();
    expect(f.dom.window.document.querySelector("dialog")!.open).toBe(true);
    expect(f.v.ui.parentElement!.tagName).toBe("DIALOG");
    f.v.ui.querySelector<HTMLButtonElement>('[aria-label="Restore diagram"]')!.click();
    expect(f.v.ui.previousElementSibling).toBe(f.block);
    expect(f.dom.window.document.querySelector("dialog")).toBeNull();
    f.v.ui.querySelector<HTMLButtonElement>('[aria-label="Maximize diagram"]')!.click();
    f.v.destroy();
    expect(f.dom.window.document.querySelector("dialog")).toBeNull();
    expect(f.dom.window.document.querySelector(".mermaider")).toBeNull();
  } finally {
    f.close();
  }
});

test("copy source reports success and clipboard failure", async () => {
  const f = setup();
  try {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(f.dom.window.navigator, "clipboard", { value: { writeText } });
    const button = f.v.ui.querySelector<HTMLButtonElement>('[aria-label="Copy Mermaid source"]')!;
    button.click();
    await vi.waitFor(() => expect(f.v.status.textContent).toBe("Copied"));
    expect(writeText).toHaveBeenCalledWith("graph LR\n A --> B");
    writeText.mockRejectedValueOnce(new Error("Denied"));
    button.click();
    await vi.waitFor(() => expect(f.v.status.textContent).toContain("Copy unavailable"));
  } finally {
    f.close();
  }
});
