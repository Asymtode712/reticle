### Fixed

- **`@reticlehq/server` — a tool call failed when the daemon died while `reticle mcp` started it.** The proxy then dialled the dead port again and again, and did not start a new daemon. The tool call waited 20 s and then failed with "no daemon could be reached". Now the proxy starts a new daemon for the waiting call. The wait for a new daemon also stops at once when the daemon process exits, and does not wait the full 10 s.
