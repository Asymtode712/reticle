### Added

- **`@reticlehq/server` — `init`, `connect`, `setup` and `verify` check four first-use problems in the first seconds.** Each failed check prints one line with the cause and its one fix. A passed check prints nothing. The command continues after a warning, so a wrong check cannot stop a setup that works.
  - Node.js is older than the version in `engines`. The line names both versions and the download.
  - No Chromium, Chrome or Edge is on the machine, so the first session downloads Chromium. The line names `RETICLE_CHROMIUM_PATH` for a network that blocks the download. A `RETICLE_CHROMIUM_PATH` that cannot be launched gets the same line that the lease gives.
  - On Windows, no PATH folder has `npx.cmd`, so an agent cannot start the MCP server. The line names the Node.js folder to add to PATH.
  - For `init`, another program holds the bridge port. Before, `init` said this only after the dependency install.
