/**
 * The page-error side of a lease: listen for the throws the SDK will never see, and tell the
 * wiring when the lease is gone.
 *
 * An app whose module graph throws during the first navigation fires its `error` event while the
 * page still has no Reticle SDK in it — the zero-install reader is only evaluated after `goto`
 * resolves — so nothing on the page records it, and a blank page reported as a bare console-error
 * count (#1966). The server's Playwright handle is attached before the navigation, so it is the
 * one witness that cannot miss the throw. This module owns that wiring for `BrowserPool`; the
 * journal that buffers and journals what arrives lives in `page-error-journal.ts`.
 */
import type { PooledPage, PooledPageError } from './pool-contract.js';

/** The page-error hooks `BrowserPoolOptions` carries, forwarded here verbatim. */
export interface LeasePageErrorHooks {
  onPageError?: ((leaseId: string, error: PooledPageError) => void) | undefined;
  onLeaseClosed?: ((leaseId: string) => void) | undefined;
}

/**
 * Install the lease's uncaught-error listener. Call BEFORE the first navigation — the listener
 * timing is the whole fix: an import-time throw lands during `goto`, and one attached after it
 * reads a broken page as healthy. Forwarded with the lease id, because the session for this lease
 * usually does not exist yet, so the sink buffers.
 */
export function listenForPageErrors(
  page: PooledPage,
  leaseId: string,
  hooks: LeasePageErrorHooks | undefined,
): void {
  page.onPageError?.((error) => {
    hooks?.onPageError?.(leaseId, error);
  });
}

/**
 * Report a closed lease — manual release, reaper and crash reclaim all funnel through the pool's
 * one release path. The wiring owns whether anything was kept FOR that lease and drops it.
 */
export function reportLeaseClosed(hooks: LeasePageErrorHooks | undefined, leaseId: string): void {
  hooks?.onLeaseClosed?.(leaseId);
}
