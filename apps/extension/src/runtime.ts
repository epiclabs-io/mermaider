import { createViewer } from "./viewer.js";
import { readGitHubBlock } from "./github.js";

export type RenderDiagram = (
  id: string,
  source: string,
  container: HTMLElement
) => Promise<{ svg: string }>;
interface State {
  block: HTMLElement;
  source: string | null;
  generation: number;
  timer?: ReturnType<typeof setTimeout>;
  viewer?: ReturnType<typeof createViewer>;
  ui?: HTMLElement;
  status?: HTMLElement;
  diagram?: HTMLElement;
  lastGood?: string;
}

const SELECTOR = ".epitaxy-codeblock, .js-render-enrichment-target, .highlight-source-mermaid, pre";
const DECLARATION =
  /^(?:%%[^\n]*\n\s*)*(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|sankey-beta|xychart-beta|block-beta|packet-beta|architecture-beta|kanban|radar-beta|treemap-beta)\b/;

export function readBlock(block: HTMLElement) {
  const github = readGitHubBlock(block);
  if (github) {
    return github;
  }
  const fence = block.querySelector("[data-code-text]");
  const code = block.querySelector("code");
  const source =
    fence?.getAttribute("data-code-text") ??
    code?.textContent ??
    (block.matches("pre") ? block.textContent : block.querySelector("pre")?.textContent) ??
    "";
  const explicit =
    block.getAttribute("data-mermaider-language") ??
    block.getAttribute("lang") ??
    block.getAttribute("data-language") ??
    (block.matches(".highlight-source-mermaid") ? "mermaid" : undefined) ??
    code?.className.match(/(?:language|lang)-([^\s]+)/)?.[1];
  // Syntax fallback keeps working if Claude changes its React internals.
  const mermaid = explicit ? explicit.toLowerCase() === "mermaid" : DECLARATION.test(source.trim());
  return { source, mermaid };
}

export function startMermaider({
  document,
  render,
  delay = 300,
  skipGitHubWidgets = false,
}: {
  document: Document;
  render: RenderDiagram;
  delay?: number;
  skipGitHubWidgets?: boolean;
}) {
  const states = new WeakMap<HTMLElement, State>();
  const active = new Set<State>();
  let serial = Promise.resolve();
  let counter = 0;
  let stopped = false;

  function remove(state: State) {
    clearTimeout(state.timer);
    state.viewer?.destroy();
    state.block.removeAttribute("data-mermaider-hidden");
    active.delete(state);
    states.delete(state.block);
  }

  function show(state: State, svg: string, source: string) {
    if (!state.ui) {
      const viewer = createViewer(document, state.block);
      Object.assign(state, {
        viewer,
        ui: viewer.ui,
        status: viewer.status,
        diagram: viewer.diagram,
      });
    }
    state.viewer!.updateSource(source);
    state.viewer!.mount();
    state.viewer!.setSVG(svg);
    state.status!.textContent = "";
    state.lastGood = source;
    state.block.setAttribute("data-mermaider-hidden", "");
  }

  function schedule(block: HTMLElement) {
    if (!block.isConnected || block.closest("[data-mermaider-ui]")) {
      return;
    }
    if (skipGitHubWidgets && block.matches(".js-render-enrichment-target")) {
      return;
    }
    // Replace the entire host widget, including its toolbar, once.
    if (
      (block.matches("pre") && block.closest(".epitaxy-codeblock, .highlight-source-mermaid")) ||
      (!block.matches(".js-render-enrichment-target") &&
        block.closest(".js-render-enrichment-target"))
    ) {
      const nested = states.get(block);
      if (nested) {
        remove(nested);
      }
      return;
    }
    const { source, mermaid } = readBlock(block);
    let state = states.get(block);
    if (!mermaid || !source.trim()) {
      if (state) {
        remove(state);
      }
      return;
    }
    if (!state) {
      state = { block, source: null, generation: 0 };
      states.set(block, state);
      active.add(state);
    }
    if (state.source === source) {
      // Reconciliation can remove an injected sibling without changing source.
      state.viewer?.mount();
      return;
    }
    state.source = source;
    state.viewer?.updateSource(source);
    const current = state;
    const generation = ++current.generation;
    clearTimeout(state.timer);
    if (state.status) {
      state.status.textContent = "Updating…";
    }
    state.timer = setTimeout(() => {
      serial = serial.then(async () => {
        if (
          stopped ||
          !block.isConnected ||
          current.generation !== generation ||
          states.get(block) !== current
        ) {
          return;
        }
        const staging = document.createElement("div");
        staging.setAttribute("data-mermaider-ui", "");
        staging.style.cssText =
          "position:fixed;left:-100000px;top:0;width:900px;visibility:hidden;pointer-events:none";
        document.body.append(staging);
        try {
          const { svg } = await render(`mermaider-${Date.now()}-${++counter}`, source, staging);
          if (
            !stopped &&
            block.isConnected &&
            current.generation === generation &&
            states.get(block) === current &&
            readBlock(block).source === source
          ) {
            show(current, svg, source);
          }
        } catch {
          // A streaming fence may not parse yet. Never hide the original on
          // first failure; retain the last valid chart on subsequent failures.
          if (current.generation === generation && current.status) {
            current.status.textContent = "Waiting for valid syntax · showing previous diagram";
          }
        } finally {
          staging.remove();
        }
      });
    }, delay);
  }

  function collect(node: Node) {
    const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    if (!el || el.closest("[data-mermaider-ui]")) {
      return;
    }
    const block = el.closest<HTMLElement>(SELECTOR);
    if (block) {
      schedule(block);
    }
    el.querySelectorAll<HTMLElement>(SELECTOR).forEach(schedule);
  }

  const observer = new document.defaultView!.MutationObserver((records) => {
    for (const state of active) {
      if (!state.block.isConnected) {
        remove(state);
      }
    }
    for (const record of records) {
      if (record.type === "childList") {
        const ownOnly = [...record.addedNodes, ...record.removedNodes].every(
          (n) => n.nodeType === 1 && (n as Element).hasAttribute("data-mermaider-ui")
        );
        if (ownOnly) {
          continue;
        }
      }
      collect(record.target);
      record.addedNodes.forEach(collect);
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "data-code-text",
      "data-mermaider-language",
      "data-plain",
      "data-json",
      "data-content",
      "data-type",
      "src",
      "lang",
      "data-language",
    ],
  });
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach(schedule);
  return {
    stop() {
      stopped = true;
      observer.disconnect();
      for (const state of active) {
        remove(state);
      }
    },
  };
}
