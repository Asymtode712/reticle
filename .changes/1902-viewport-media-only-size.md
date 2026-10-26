### Fixed

- **`@reticlehq/server`: `reticle_viewport` with only `colorScheme` or `reducedMotion` answered `width: 0, height: 0`.** The call changed the media and kept the size, but the answer read as a broken 0 × 0 viewport. It now answers the size the lease already has, and leaves `width` and `height` out when the page cannot be read. `width` and `height` are optional in the tool's output schema. Closes [#1902](https://github.com/reticlehq/reticle/issues/1902).
