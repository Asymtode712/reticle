### Fixed

- **`@reticlehq/browser`, `@reticlehq/server` — `summary.layoutShift` reported the page's running total, not what the action did.** The value grew on every `act_and_wait`, even for actions that moved nothing, and an idle dev page with the HUD shown counted the HUD's own shifts. It is now the layout shift inside the action's window, and shifts whose every source is Reticle's UI are skipped. Closes [#1784](https://github.com/reticlehq/reticle/issues/1784).
