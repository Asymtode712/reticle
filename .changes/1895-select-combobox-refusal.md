### Fixed

- **`@reticlehq/browser`: `select` on a Radix or Headless UI combobox named no way forward.** The refusal was `cannot select on a <button>`. For an element with `role="combobox"` or `aria-haspopup="listbox"`, the refusal now says to click the combobox, then click the option with `{ role: "option", name: "<label>" }`. Closes [#1895](https://github.com/reticlehq/reticle/issues/1895).
