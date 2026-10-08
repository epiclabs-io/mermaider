// Runs in the page world solely to read the fence language. Rendering runs
// in Chrome's isolated content-script world. No page functions are invoked.
export function startLanguageDetector(document: Document) {
  const selector = ".epitaxy-codeblock";
  interface Fiber {
    memoizedProps?: { rawLang?: string; lang?: string };
    return?: Fiber;
  }
  const pending = new Set<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function inspect(block: HTMLElement) {
    const key = Object.keys(block).find((k) => k.startsWith("__reactFiber"));
    let fiber = key ? (block as unknown as Record<string, Fiber>)[key] : undefined;
    for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      const language = props?.rawLang ?? props?.lang;
      if (typeof language === "string") {
        const value = language.trim().toLowerCase();
        if (block.getAttribute("data-mermaider-language") !== value) {
          block.setAttribute("data-mermaider-language", value);
        }
        return;
      }
    }
  }
  function collect(node: Node) {
    const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    if (!el || el.closest("[data-mermaider-ui]")) {
      return;
    }
    const block = el.closest<HTMLElement>(selector);
    if (block) {
      pending.add(block);
    }
    el.querySelectorAll<HTMLElement>(selector).forEach((b) => pending.add(b));
  }
  const observer = new document.defaultView!.MutationObserver((records) => {
    for (const record of records) {
      collect(record.target);
      record.addedNodes.forEach(collect);
    }
    if (!pending.size) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const block of pending) {
        if (block.isConnected) {
          inspect(block);
        }
      }
      pending.clear();
    }, 50);
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-code-text"],
  });
  document.querySelectorAll<HTMLElement>(selector).forEach(inspect);
  return {
    stop() {
      observer.disconnect();
      clearTimeout(timer);
      pending.clear();
    },
  };
}

if (typeof document !== "undefined") {
  startLanguageDetector(document);
}
