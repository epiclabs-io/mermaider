const PARENT_ORIGIN = "https://github.com";

/** Runs only inside GitHub's Mermaid iframe; all code is bundled locally. */
export function startGitHubFrame(document: Document) {
  const win = document.defaultView!;
  let token: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = "";

  function publish(refreshed = false) {
    if (!token) {
      return;
    }
    const svg =
      document.querySelector<SVGSVGElement>("svg[aria-roledescription]") ??
      document.querySelector<SVGSVGElement>("svg[id][viewBox]");
    if (!svg || !svg.querySelector("g, text, path, rect")) {
      return;
    }
    const serialized = svg.outerHTML;
    if (serialized === last && !refreshed) {
      return;
    }
    last = serialized;
    win.parent.postMessage(
      {
        type: "mermaider:github-svg",
        token,
        svg: serialized,
        refreshed,
        height: svg.getBoundingClientRect().height,
      },
      PARENT_ORIGIN
    );
  }
  function receive(event: MessageEvent) {
    if (
      event.origin !== PARENT_ORIGIN ||
      event.source !== win.parent ||
      event.data?.type !== "mermaider:request-svg" ||
      typeof event.data.token !== "string"
    ) {
      return;
    }
    token = event.data.token;
    last = "";
    publish();
  }
  const observer = new win.MutationObserver((records) => {
    clearTimeout(timer);
    const refreshed = records.some(
      (record) => record.type === "childList" || record.type === "characterData"
    );
    timer = setTimeout(() => publish(refreshed), 80);
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  win.addEventListener("message", receive);
  win.parent.postMessage({ type: "mermaider:github-ready" }, PARENT_ORIGIN);
  return {
    stop() {
      observer.disconnect();
      clearTimeout(timer);
      win.removeEventListener("message", receive);
    },
  };
}

if (
  typeof document !== "undefined" &&
  location.hostname === "viewscreen.githubusercontent.com" &&
  location.pathname === "/markdown/mermaid"
) {
  startGitHubFrame(document);
}
