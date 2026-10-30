### Fixed

- **`@reticlehq/browser` — Text checks now find visible children inside containers with `visibility: hidden` or `collapse`.** A child can override inherited visibility with `visibility: visible`. Presence and absence checks now use that computed value. Subtrees hidden by `display: none`, the `hidden` attribute or closed details remain hidden. Closes [#2047](https://github.com/reticlehq/reticle/issues/2047).
