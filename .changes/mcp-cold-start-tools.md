### Fixed

- **`@reticlehq/server` — a client that did not wait for MCP servers got no Reticle tools on a first start.** Some clients, such as Codex, start the turn about 1.5 s after they launch the MCP server. On a first start the daemon was not up by then, and `reticle mcp` answered `initialize` only after the daemon was up. The agent had no Reticle tools for the whole turn. Now `reticle mcp` answers `initialize` and `tools/list` at once while it starts its daemon. The tool list is the same list that the daemon serves. A tool call waits until the daemon is up.
