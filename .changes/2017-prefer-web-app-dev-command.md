### Fixed

- **`@reticlehq/server` — `next_action` sent the agent to a backend or read-only folder.** When a project folder held a backend beside the web app, the no-session answer could hand the agent `npm run dev` for the backend. It now prefers the writable web app, so the agent starts the app that serves the page, and keeps every other folder with a dev script as the fallback when nothing here reads as a web app. Closes [#2017](https://github.com/reticlehq/reticle/issues/2017).
