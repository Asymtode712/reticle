### Fixed

- **`@reticlehq/browser`: controls on a flipped card's visible face read as `hidden`.** `backface-visibility: hidden` was treated as if it hid the element outright, so `isVisible` never asked which face of the card was turned toward the viewer: a QR button on the face in view stayed `hidden`, and a `state: 'visible'` check could never pass on it. Visible now composes the transforms from the element up to the root and hides only the face turned away, leaving the face toward the viewer visible. Closes [#1940](https://github.com/reticlehq/reticle/issues/1940).
