### Fixed

- **`@reticlehq/server` — a leased tab could stay open after the agent left.** When the browser did not answer, closing the tab waited with no limit. The lease slot stayed taken, and the reaper wrote no `lease_reaped_expired` line. Now each close waits at most 5 seconds. After that, Reticle frees the slot, logs `lease_close_timed_out`, and closes the browser that holds the tab, unless another lease still uses it.
