### Fixed

- **`@reticlehq/server` — the sync sent agent capture after you stopped it.** With `"promptCapture": false` or `RETICLE_PROMPT_CAPTURE=0`, the hooks kept nothing new. But the sync still read the files that they kept before, and sent the agent's model, its closing message and your prompt with each run. Now the sync sends none of them while agent capture is off.
