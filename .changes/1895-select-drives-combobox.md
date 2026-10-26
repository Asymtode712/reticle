### Added

- **`@reticlehq/browser`: `select` drives an ARIA combobox.** On a Radix Select, a Headless UI Listbox or any element with `role="combobox"` or `aria-haspopup="listbox"`, `select` now opens the popup and clicks the `role="option"` whose label or `data-value` matches. A value that matches no option is refused with the names that exist, the same way the native `<select>` path refuses it, and a popup that the call opened is closed again. A disabled option and an ambiguous label are also refused. Follows [#1895](https://github.com/reticlehq/reticle/issues/1895).
