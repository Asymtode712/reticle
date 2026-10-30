### Fixed

- **`@reticlehq/server` — parallel verification lost the source lease's certificate setting.** Per-flow leases now inherit `ignoreHTTPSErrors`, so saved flows can replay against self-signed HTTPS development servers. `reticle_verify` also accepts this option for parallel flows without a source lease. Closes [#2033](https://github.com/reticlehq/reticle/issues/2033).
