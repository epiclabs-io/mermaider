import createDOMPurify from "dompurify";
import { findGitHubFrame, readGitHubBlock } from "./github.js";
import { createViewer } from "./viewer.js";
import type { RenderDiagram } from "./runtime.js";

const FRAME_ORIGIN = "https://viewscreen.githubusercontent.com";
type Viewer = ReturnType<typeof createViewer>;
interface State {
  block: HTMLElement;
  frame: HTMLIFrameElement;
  source: string;
  token: string;
  height: number;
  viewer?: Viewer;
  native?: string;
  rawNative?: string;
  previousNative?: string;
  local?: string;
  pending?: Promise<void>;
  renderer: "GitHub" | "Mermaider";
  retry?: ReturnType<typeof setInterval>;
}

export function startGitHubViewers({
  document,
  render,
}: {
  document: Document;
  render: RenderDiagram;
}) {
  const win = document.defaultView!;
  const purify = createDOMPurify(win);
  const states = new Map<HTMLElement, State>();
  let serial = Promise.resolve();
  let counter = 0;
  let stopped = false;

  function dispose(state: State) {
    clearInterval(state.retry);
    state.viewer?.destroy();
    state.block.removeAttribute("data-mermaider-hidden");
    states.delete(state.block);
  }
  function request(state: State) {
    state.frame.contentWindow?.postMessage(
      { type: "mermaider:request-svg", token: state.token },
      FRAME_ORIGIN
    );
  }
  function display(state: State, svg: string, native: boolean) {
    if (!state.viewer) {
      state.viewer = createViewer(document, state.block, {
        viewportHeight: state.height || 300,
        fitPadding: 0,
        onRendererToggle: () => {
          state.renderer = state.renderer === "GitHub" ? "Mermaider" : "GitHub";
          if (state.renderer === "GitHub" && state.native) {
            display(state, state.native, true);
          } else {
            void showLocal(state);
          }
        },
      });
    }
    state.viewer.updateSource(state.source);
    state.viewer.mount();
    if (state.height > 0) {
      state.viewer.setViewportHeight(state.height);
    }
    state.viewer.setSVG(svg, { isolate: native, reset: true });
    state.viewer.setRenderer(native ? "GitHub" : "Mermaider");
    state.viewer.status.textContent = "";
    state.block.setAttribute("data-mermaider-hidden", "");
  }
  function showLocal(state: State): Promise<void> {
    if (state.local) {
      display(state, state.local, false);
      return Promise.resolve();
    }
    if (state.pending) {
      return state.pending;
    }
    const token = state.token;
    const source = state.source;
    if (state.viewer) {
      state.viewer.setRenderer("Mermaider");
      state.viewer.status.textContent = "Rendering…";
    }
    const pending = serial.then(async () => {
      if (stopped || !state.block.isConnected || state.token !== token) {
        return;
      }
      const staging = document.createElement("div");
      staging.setAttribute("data-mermaider-ui", "");
      staging.style.cssText = "position:fixed;left:-100000px;top:0;width:900px;visibility:hidden";
      document.body.append(staging);
      try {
        const { svg } = await render(
          `mermaider-github-${Date.now()}-${++counter}`,
          source,
          staging
        );
        if (
          !stopped &&
          states.get(state.block) === state &&
          state.token === token &&
          state.block.isConnected
        ) {
          state.local = svg;
          if (state.renderer === "Mermaider") {
            display(state, svg, false);
          }
        }
      } catch {
        if (states.get(state.block) === state && state.token === token && state.native) {
          state.renderer = "GitHub";
          display(state, state.native, true);
          state.viewer!.status.textContent = "Mermaider could not render; using GitHub SVG";
        }
      } finally {
        staging.remove();
        if (state.pending === pending) {
          state.pending = undefined;
        }
      }
    });
    state.pending = pending;
    serial = pending;
    return pending;
  }
  function inspect(block: HTMLElement) {
    const data = readGitHubBlock(block);
    const frame = findGitHubFrame(block);
    let state = states.get(block);
    if (!block.isConnected || !data?.mermaid || !data.source || !frame) {
      if (state) {
        dispose(state);
      }
      return;
    }
    if (state && state.frame !== frame) {
      dispose(state);
      state = undefined;
    }
    if (!state) {
      const height =
        frame.getBoundingClientRect().height ||
        frame.parentElement?.getBoundingClientRect().height ||
        0;
      state = {
        block,
        frame,
        height,
        source: data.source,
        token: win.crypto.randomUUID(),
        renderer: "GitHub",
      };
      states.set(block, state);
      const current = state;
      state.retry = setInterval(() => {
        request(current);
      }, 500);
      request(state);
    } else if (state.source !== data.source) {
      state.source = data.source;
      state.token = win.crypto.randomUUID();
      state.previousNative = state.rawNative;
      state.native = undefined;
      state.local = undefined;
      state.pending = undefined;
      state.viewer?.updateSource(data.source);
      if (state.viewer) {
        state.viewer.status.textContent = "Updating GitHub diagram…";
      }
      request(state);
    } else {
      state.viewer?.mount();
    }
  }
  function receive(event: MessageEvent) {
    if (event.origin !== FRAME_ORIGIN) {
      return;
    }
    const message = event.data;
    if (
      !message ||
      (message.type !== "mermaider:github-ready" && message.type !== "mermaider:github-svg")
    ) {
      return;
    }
    const state = Array.from(states.values()).find((s) => s.frame.contentWindow === event.source);
    if (!state || !state.block.isConnected) {
      return;
    }
    if (message.type === "mermaider:github-ready") {
      request(state);
      return;
    }
    if (
      message.token !== state.token ||
      typeof message.svg !== "string" ||
      message.svg.length > 5_000_000
    ) {
      return;
    }
    if (state.previousNative === message.svg && !message.refreshed) {
      return;
    }
    const fragment = purify.sanitize(message.svg, {
      USE_PROFILES: { svg: true, svgFilters: true, html: true },
      ADD_TAGS: ["foreignObject"],
      HTML_INTEGRATION_POINTS: { foreignobject: true },
      FORBID_TAGS: ["script", "iframe", "object", "embed", "a"],
      RETURN_DOM_FRAGMENT: true,
    });
    // GitHub serializes mixed SVG/HTML with outerHTML, including HTML void
    // elements such as <br>. Validate the sanitized DOM, not an XML reparse
    // that incorrectly rejects valid foreignObject labels.
    const element = fragment.firstElementChild;
    if (
      fragment.children.length !== 1 ||
      element?.localName !== "svg" ||
      element.namespaceURI !== "http://www.w3.org/2000/svg"
    ) {
      return;
    }
    const svg = new win.XMLSerializer().serializeToString(element);
    state.rawNative = message.svg;
    state.previousNative = undefined;
    state.native = svg;
    // Preserve the native diagram's full height rather than applying the
    // generic viewer's 480px cap. Late iframe rendering may establish it here.
    if (!state.viewer && typeof message.height === "number" && Number.isFinite(message.height)) {
      state.height = Math.max(state.height, message.height);
    }
    clearInterval(state.retry);
    if (state.renderer === "GitHub") {
      display(state, svg, true);
    } else {
      void showLocal(state);
    }
  }
  function collect(node: Node) {
    const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    if (!el || el.closest("[data-mermaider-ui]")) {
      return;
    }
    const parent = el.closest<HTMLElement>(".js-render-enrichment-target");
    if (parent) {
      inspect(parent);
    }
    el.querySelectorAll<HTMLElement>(".js-render-enrichment-target").forEach(inspect);
  }
  const observer = new win.MutationObserver((records) => {
    for (const state of states.values()) {
      if (!state.block.isConnected) {
        dispose(state);
      }
    }
    for (const record of records) {
      if (
        record.type === "childList" &&
        [...record.addedNodes, ...record.removedNodes].every(
          (n) => n.nodeType === 1 && (n as Element).hasAttribute("data-mermaider-ui")
        )
      ) {
        continue;
      }
      collect(record.target);
      record.addedNodes.forEach(collect);
    }
  });
  win.addEventListener("message", receive);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-plain", "data-json", "data-content", "data-type", "src"],
  });
  document.querySelectorAll<HTMLElement>(".js-render-enrichment-target").forEach(inspect);
  return {
    stop() {
      stopped = true;
      observer.disconnect();
      win.removeEventListener("message", receive);
      for (const state of states.values()) {
        dispose(state);
      }
    },
  };
}
