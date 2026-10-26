### Fixed

- **`@reticlehq/server` — `reticle doctor` reported the agent link from a stored record even when the port was held but `/status` did not answer.** A daemon with a suspended event loop still accepted TCP, so the link read as healthy, or doctor told the user to restart the client, which does not help. The agent link row now points to the daemon row above, which already names the one fix for the held port, and it prints no command of its own. Closes [#1710](https://github.com/reticlehq/reticle/issues/1710).
