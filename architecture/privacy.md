# Mermaider privacy

Mermaider reads Mermaid code blocks on claude.ai and github.com and renders diagrams locally in
the browser. It does not send code, conversations, or account information to any
server, and it contains no analytics or tracking. Mermaid is bundled locally.

A bundled content script reads the rendered SVG from GitHub's Mermaid iframe on
viewscreen.githubusercontent.com/markdown/mermaid and passes it to its GitHub
parent page through local browser messages. No data is sent to an external service.

The copy-source control writes the selected diagram's source to the clipboard
only when the user clicks it. There is no conversation storage or clipboard
reading. Settings and account data are not collected.

This policy describes the extension, not Claude's or GitHub's handling of user content.
