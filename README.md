# Mermaider

Chrome Manifest V3 extension that renders Mermaid code blocks inline on Claude,
including Claude Code, and replaces GitHub's Mermaid widgets with an interactive
viewer in issues, pull requests, comments, and rendered Markdown.

Development lives on **dev**. **master** is the release branch.

## Install

```sh
npm ci
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this project's **dist** directory.
3. Refresh your Claude or GitHub tab. When upgrading from the Claude-only version,
   approve the new GitHub site access if Chrome asks.

Mermaid is bundled into the extension: no CDN, remote scripts, backend, or API
keys are needed. No extension permissions are requested beyond content-script
access to Claude and GitHub.

Requires Node.js 24+ and npm. The extension requires Chrome 120+.

## Behavior

- Watches newly mounted messages, including messages brought in by scrolling.
- Replaces GitHub's Mermaid widget and native controls with Mermaider, using the
  source embedded in the page. No access to the cross-origin SVG iframe is needed.
- Handles GitHub's partial navigation, newly loaded comments, and updated diagrams.
- Watches changes to code text while Claude streams, with a 300 ms debounce.
- Serializes renders and discards outdated results.
- Leaves unparseable initial blocks as code. After a successful render, retains
  the last good diagram during incomplete updates and displays a status message.
- Icon controls toggle an independent source view, copy source, fit the diagram,
  and maximize it into a modal. Escape closes the maximized view.
- Left-button drag pans. The mouse wheel zooms around the cursor, like a map.
  Arrow keys pan, plus/minus zoom, and zero fits the diagram.
- The original React-managed code node is preserved and hidden after rendering.
- Cleans up when messages are unmounted and renders again when they return.

Claude Code puts code in `diffs-container` shadow roots, but exposes its source
on `.epitaxy-fence[data-code-text]`. A small page-world detector reads the React
fence's language and annotates the enclosing block. The renderer runs in Chrome's
isolated world. If that metadata becomes unavailable, recognized Mermaid diagram
declarations serve as a fallback. Standard `pre > code.language-mermaid` blocks
are also supported.

GitHub stores diagram definitions on `.js-render-enrichment-target` elements as
`data-plain`/`data-json`, or in the rendering iframe's `data-content` attribute.
Mermaider re-renders these with its bundled Mermaid library and only hides the
native widget after a successful render. Other embedded content is untouched;
invalid or unsupported Mermaid stays in GitHub's viewer.

Mermaid uses strict security mode, disables HTML flowchart labels, and does not
activate diagram click handlers. Theme follows the system preference at page load.
Changes are local to your browser; the conversation itself is not edited.

## Development

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

After a rebuild, reload the extension in `chrome://extensions` and refresh the target tab.

### Layout and conventions

- `apps/extension/src`: strict TypeScript content scripts and viewer.
- `apps/extension/tests`: Vitest behavior and regression tests.
- `apps/extension/assets`: source icon; the build generates 16/32/48/128 px PNGs.
- `lib/<package>`: shared workspaces when needed.
- `scripts`: TypeScript build, packaging, and Chrome Web Store API tooling.
- `architecture`: release setup and privacy documentation.

Formatting and linting match vecs: Prettier with double quotes, two spaces,
semicolons, and a 100-column limit; ESLint requires braces on every conditional
and rejects unused imports. Husky's pre-commit hook runs typechecking,
lint-staged formatting/lint fixes, and a full formatting check. Commit messages
use `<type>: <subject>` without a scope, with a body explaining intent, behavior,
and verification. Do not bypass hooks.

### Releases

`npm run package` builds `dist/mermaider.zip`. Pull requests run all checks and
package the extension in GitHub Actions. A merge into `master` creates a versioned
GitHub release and, once configured, uploads and submits it to the Chrome Web Store.

See [Chrome Web Store setup](architecture/chrome-web-store.md) for the first
listing upload, OAuth credentials, repository variables/secrets, and release
versioning. See [privacy](architecture/privacy.md) for the extension's data handling.
