### Fixed

- **`@reticlehq/browser` — `fill`, `type` and `clear` wrote into the hidden `<textarea>` of a code editor and reported success.** Monaco and CodeMirror keep their input in a `<textarea>` with `role="textbox"`. The editor merges a direct write with its own model, so the text ended up doubled and the next check failed like an app defect. These actions now refuse such a textarea with the editor message ("use press or an input"). A plain `<textarea>` still fills. Closes [#1666](https://github.com/reticlehq/reticle/issues/1666).
