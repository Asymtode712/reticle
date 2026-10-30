### Fixed

- **`@reticlehq/server` — a lease that timed out on a dev server still compiling its first route told the agent to start the server.** A large Next.js app can take longer than the 30 s navigation budget to compile its first route, and the refusal ended with "If it is not running, start it first", sending the agent to start a second dev server. When the URL's port accepted the connection, the refusal now says the server is running and probably compiling, and to wait and acquire the lease again. Closes [#2005](https://github.com/reticlehq/reticle/issues/2005).
