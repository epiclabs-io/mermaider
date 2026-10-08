/** Read GitHub's source without entering its cross-origin rendering iframe. */
export function readGitHubBlock(
  block: HTMLElement
): { source: string; mermaid: boolean } | undefined {
  if (!block.matches(".js-render-enrichment-target")) {
    return undefined;
  }

  const frame = findGitHubFrame(block);
  const mermaid = !!block.querySelector('[data-type="mermaid"]') || !!frame;
  if (!mermaid) {
    return { source: "", mermaid: false };
  }

  const source =
    block.getAttribute("data-plain") ??
    readJSONSource(block.getAttribute("data-json")) ??
    readJSONSource(frame?.getAttribute("data-content") ?? null) ??
    block.querySelector('clipboard-copy[aria-label="Copy mermaid code"]')?.getAttribute("value") ??
    "";
  return { source, mermaid: true };
}

export function findGitHubFrame(block: HTMLElement): HTMLIFrameElement | undefined {
  return Array.from(block.querySelectorAll<HTMLIFrameElement>("iframe[src]")).find((element) =>
    isMermaidFrame(element.getAttribute("src") ?? "")
  );
}

function isMermaidFrame(src: string): boolean {
  try {
    const url = new URL(src);
    return (
      url.origin === "https://viewscreen.githubusercontent.com" &&
      url.pathname === "/markdown/mermaid"
    );
  } catch {
    return false;
  }
}

function readJSONSource(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "data" in parsed &&
      typeof parsed.data === "string"
    ) {
      return parsed.data;
    }
  } catch {
    // A placeholder can arrive before GitHub finishes enriching the Markdown.
  }
  return undefined;
}
