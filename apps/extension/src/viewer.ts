const ICONS = {
  source: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
  diagram:
    '<rect x="2" y="3" width="7" height="5" rx="1"/><rect x="15" y="16" width="7" height="5" rx="1"/><path d="M5.5 8v10H15m-3-3 3 3-3 3"/>',
  maximize: '<path d="M8 3H3v5m0-5 6 6m7-6h5v5m0-5-6 6M3 16v5h5m-5 0 6-6m12 1v5h-5m5 0-6-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  renderer: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
};

function icon(button: HTMLButtonElement, name: keyof typeof ICONS, label: string) {
  button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  button.title = label;
  button.setAttribute("aria-label", label);
}

export interface ViewerOptions {
  viewportHeight?: number;
  fitPadding?: number;
  onRendererToggle?: () => void;
}

export function createViewer(document: Document, block: HTMLElement, options: ViewerOptions = {}) {
  const win = document.defaultView!;
  const ui = document.createElement("section");
  ui.setAttribute("data-mermaider-ui", "");
  ui.className = "mermaider";
  const toolbar = document.createElement("div");
  toolbar.className = "mermaider-toolbar";
  const title = document.createElement("span");
  title.textContent = "Mermaid";
  const status = document.createElement("span");
  status.className = "mermaider-status";
  status.setAttribute("aria-live", "polite");
  const actions = document.createElement("div");
  actions.className = "mermaider-actions";
  toolbar.append(title, status, actions);
  const diagram = document.createElement("div");
  diagram.className = "mermaider-diagram";
  diagram.tabIndex = 0;
  diagram.setAttribute("role", "region");
  diagram.setAttribute(
    "aria-label",
    "Mermaid diagram. Drag to pan, scroll to zoom. Use arrow keys to pan, plus or minus to zoom, and zero to fit."
  );
  const canvas = document.createElement("div");
  canvas.className = "mermaider-canvas";
  diagram.append(canvas);
  const source = document.createElement("pre");
  source.className = "mermaider-source";
  source.tabIndex = 0;
  source.hidden = true;
  ui.append(toolbar, diagram, source);
  let showSource = false;
  let dialog: HTMLDialogElement | undefined;
  let placeholder: HTMLDivElement | undefined;
  let disposed = false;
  let width = 900,
    height = 300,
    scale = 1,
    x = 0,
    y = 0,
    fitScale = 1;
  let interacted = false;
  let drag: { id: number; x: number; y: number } | undefined;
  let viewportHeight = options.viewportHeight;
  const rendererToggle = options.onRendererToggle
    ? button("renderer", "Use Mermaider SVG", options.onRendererToggle)
    : undefined;

  function button(name: keyof typeof ICONS, label: string, onClick: () => void) {
    const b = document.createElement("button");
    b.type = "button";
    icon(b, name, label);
    b.addEventListener("click", onClick);
    actions.append(b);
    return b;
  }
  const toggle = button("source", "Show source", () => {
    showSource = !showSource;
    source.hidden = !showSource;
    diagram.hidden = showSource;
    icon(toggle, showSource ? "diagram" : "source", showSource ? "Show diagram" : "Show source");
    toggle.setAttribute("aria-pressed", String(showSource));
    if (!showSource && !interacted) {
      fit();
    }
  });
  button("copy", "Copy Mermaid source", async () => {
    try {
      await win.navigator.clipboard.writeText(source.textContent ?? "");
      status.textContent = "Copied";
    } catch {
      status.textContent = "Copy unavailable. Select the source to copy it.";
    }
  });
  button("fit", "Fit diagram", () => {
    interacted = false;
    fit();
  });
  const maximize = button("maximize", "Maximize diagram", () => {
    if (dialog) {
      dialog.close();
      return;
    }
    dialog = document.createElement("dialog");
    dialog.className = "mermaider-modal";
    dialog.setAttribute("data-mermaider-ui", "");
    dialog.setAttribute("aria-label", "Maximized Mermaid diagram");
    // Copy the actual page color, including sites with manual dark mode.
    let parent: HTMLElement | null = ui;
    while (parent) {
      const bg = win.getComputedStyle(parent).backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)" && !bg.startsWith("rgba(")) {
        dialog.style.backgroundColor = bg;
        break;
      }
      parent = parent.parentElement;
    }
    dialog.style.color = win.getComputedStyle(ui).color;
    // Keep the message's height stable while the viewer lives in the top layer.
    // Otherwise a virtualized conversation can scroll or unmount the message.
    placeholder = document.createElement("div");
    placeholder.setAttribute("data-mermaider-ui", "");
    placeholder.style.height = `${ui.getBoundingClientRect().height}px`;
    ui.before(placeholder);
    document.body.append(dialog);
    dialog.append(ui);
    ui.classList.add("mermaider-maximized");
    icon(maximize, "close", "Restore diagram");
    const current = dialog;
    dialog.addEventListener(
      "close",
      () => {
        if (dialog !== current) {
          return;
        }
        dialog = undefined;
        ui.classList.remove("mermaider-maximized");
        icon(maximize, "maximize", "Maximize diagram");
        if (!disposed && block.isConnected) {
          if (placeholder?.isConnected) {
            placeholder.replaceWith(ui);
          } else {
            block.after(ui);
          }
        }
        placeholder?.remove();
        placeholder = undefined;
        current.remove();
        if (!disposed) {
          interacted = false;
          fit();
          maximize.focus();
        }
      },
      { once: true }
    );
    dialog.showModal();
    interacted = false;
    fit();
  });

  function apply() {
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }
  function fit() {
    if (diagram.hidden) {
      return;
    }
    const vw = diagram.clientWidth || 900;
    const vh = diagram.clientHeight || 300;
    const padding = options.fitPadding ?? 32;
    fitScale = Math.max(0.01, Math.min((vw - padding) / width, (vh - padding) / height));
    scale = Math.max(0.01, fitScale);
    x = (vw - width * scale) / 2;
    y = (vh - height * scale) / 2;
    apply();
  }
  function zoom(factor: number, px: number, py: number) {
    const next = Math.max(fitScale * 0.15, Math.min(fitScale * 20, scale * factor));
    x = px - ((px - x) * next) / scale;
    y = py - ((py - y) * next) / scale;
    scale = next;
    interacted = true;
    apply();
  }
  diagram.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = diagram.getBoundingClientRect();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? diagram.clientHeight : 1);
      zoom(
        Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.002),
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    },
    { passive: false }
  );
  diagram.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    diagram.setPointerCapture?.(event.pointerId);
    diagram.classList.add("mermaider-dragging");
    diagram.focus({ preventScroll: true });
  });
  diagram.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) {
      return;
    }
    x += event.clientX - drag.x;
    y += event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    interacted = true;
    apply();
  });
  function endDrag() {
    drag = undefined;
    diagram.classList.remove("mermaider-dragging");
  }
  diagram.addEventListener("pointerup", endDrag);
  diagram.addEventListener("pointercancel", endDrag);
  diagram.addEventListener("lostpointercapture", endDrag);
  diagram.addEventListener("keydown", (event) => {
    if (["+", "=", "-", "0"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "0") {
        interacted = false;
        fit();
      } else {
        zoom(event.key === "-" ? 0.8 : 1.25, diagram.clientWidth / 2, diagram.clientHeight / 2);
      }
    } else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      if (event.key === "ArrowLeft") {
        x += 40;
      }
      if (event.key === "ArrowRight") {
        x -= 40;
      }
      if (event.key === "ArrowUp") {
        y += 40;
      }
      if (event.key === "ArrowDown") {
        y -= 40;
      }
      interacted = true;
      apply();
    }
  });
  const resize =
    win.ResizeObserver &&
    new win.ResizeObserver(() => {
      if (!interacted) {
        fit();
      }
    });
  resize?.observe(diagram);

  return {
    ui,
    status,
    diagram,
    updateSource(text: string) {
      source.textContent = text;
    },
    mount() {
      if (!dialog && ui.previousElementSibling !== block) {
        block.after(ui);
      }
    },
    setRenderer(renderer: "GitHub" | "Mermaider") {
      title.textContent = `Mermaid · ${renderer}`;
      if (rendererToggle) {
        icon(
          rendererToggle,
          "renderer",
          renderer === "GitHub" ? "Use Mermaider SVG" : "Use GitHub SVG"
        );
        rendererToggle.setAttribute("aria-pressed", String(renderer === "Mermaider"));
      }
    },
    setViewportHeight(value: number) {
      viewportHeight = value;
      diagram.style.setProperty("--mermaider-height", `${value}px`);
      if (!interacted) {
        fit();
      }
    },
    setSVG(svg: string, settings: { isolate?: boolean; reset?: boolean } = {}) {
      canvas.replaceChildren();
      let root: HTMLElement | ShadowRoot = canvas;
      if (settings.isolate) {
        // GitHub reuses SVG IDs across iframe documents. Keep their styles and
        // fragment references isolated when showing several diagrams together.
        const host = document.createElement("div");
        canvas.append(host);
        root = host.attachShadow({ mode: "open" });
      }
      root.innerHTML = svg;
      const el = root.querySelector("svg");
      const values = el
        ?.getAttribute("viewBox")
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
      if (values?.length === 4 && values[2] > 0 && values[3] > 0) {
        width = values[2];
        height = values[3];
      }
      if (el) {
        el.style.cssText = `display:block;width:${width}px;height:${height}px;max-width:none;`;
        el.setAttribute("aria-label", "Mermaid diagram");
      }
      diagram.style.setProperty(
        "--mermaider-height",
        `${viewportHeight ?? Math.max(220, Math.min(480, height + 32))}px`
      );
      if (settings.reset) {
        interacted = false;
      }
      if (!interacted) {
        fit();
      }
    },
    destroy() {
      disposed = true;
      resize?.disconnect();
      if (dialog) {
        const current = dialog;
        current.close();
        current.remove();
        dialog = undefined;
      }
      placeholder?.remove();
      ui.remove();
    },
  };
}
