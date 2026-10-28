### Fixed

- **`@reticlehq/server` — `reticle verify <url>` from a newer CLI failed before it opened the page when the running daemon was older.** The CLI sends the lease the `root` argument, and a daemon from an older release refuses a parameter it does not know, so the run ended as `unverifiable` with "unknown parameter for reticle_lease: root". The CLI now asks once more without `root` when the daemon refuses that parameter, so the page opens against the older daemon (its runs land where that daemon puts them). Closes [#1659](https://github.com/reticlehq/reticle/issues/1659).
