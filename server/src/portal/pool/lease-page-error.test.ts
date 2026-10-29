/**
 * The pool hands every uncaught page error to a sink, with the lease id attached.
 *
 * An error thrown while the page's own modules evaluate — the blank-page case (#1966) — fires
 * before the SDK exists to see it. The server's Playwright handle is attached from before the
 * navigation for exactly this reason, so the listener MUST be installed before `goto` runs: an
 * import-time throw lands during it, and a listener attached after the fact reads the page as
 * healthy. A sink the wiring did not provide degrades to silence, which is the honest reading —
 * "nobody is listening" must not read as "the page threw nothing".
 */
import { describe, expect, it, vi } from 'vitest';
import { BrowserPool } from './browser-pool.js';
import type { Launcher, PooledPage } from './browser-pool.js';

const launcher = (page: Partial<Record<keyof PooledPage, unknown>> = {}): Launcher => {
  const full = {
    goto: () => Promise.resolve(),
    close: () => Promise.resolve(),
    onCrash: () => undefined,
    ...page,
  } as PooledPage;
  return () =>
    Promise.resolve({
      newContext: () =>
        Promise.resolve({
          newPage: () => Promise.resolve(full),
          close: () => Promise.resolve(),
        }),
      close: () => Promise.resolve(),
      onDisconnected: (): void => undefined,
      isConnected: (): boolean => true,
    });
};

let seq = 0;
const ids = (): string => `lease-${String((seq += 1))}`;

describe('forwarding uncaught page errors to the wiring', () => {
  it('calls the sink with the lease id and the error', async () => {
    let fire: ((error: { message: string; stack?: string }) => void) | undefined;
    const onPageError = vi.fn((handler: (error: { message: string; stack?: string }) => void) => {
      fire = handler;
    });
    const sink = vi.fn();
    const pool = new BrowserPool(launcher({ onPageError }), {
      maxContexts: 2,
      genSessionId: ids,
      onPageError: sink,
    });
    const lease = await pool.acquire('http://app.test/');

    fire?.({ message: 'boom at module evaluation', stack: 'Error: boom' });

    expect(sink).toHaveBeenCalledWith(lease.sessionId, {
      message: 'boom at module evaluation',
      stack: 'Error: boom',
    });
    await lease.release();
  });

  it('installs the listener before navigation, so an import-time throw during goto is seen', async () => {
    let fire: ((error: { message: string; stack?: string }) => void) | undefined;
    const onPageError = vi.fn((handler: (error: { message: string; stack?: string }) => void) => {
      fire = handler;
    });
    const goto = vi.fn(() => {
      // The error happens WHILE the navigation runs — before acquire has returned.
      fire?.({ message: 'boom during goto' });
      return Promise.resolve();
    });
    const sink = vi.fn();
    const pool = new BrowserPool(launcher({ onPageError, goto }), {
      maxContexts: 2,
      genSessionId: ids,
      onPageError: sink,
    });

    await pool.acquire('http://app.test/');

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]?.[1]).toEqual({ message: 'boom during goto' });
  });

  it('works when the page fake has no onPageError at all', async () => {
    const pool = new BrowserPool(launcher(), { maxContexts: 2, genSessionId: ids });
    const lease = await pool.acquire('http://app.test/');
    expect(lease.sessionId).toContain('lease-');
    await lease.release();
  });

  it('tells the wiring when a lease is released, so per-lease state can be dropped', async () => {
    const onLeaseClosed = vi.fn();
    const pool = new BrowserPool(launcher(), {
      maxContexts: 2,
      genSessionId: ids,
      onLeaseClosed,
    });
    const lease = await pool.acquire('http://app.test/');

    await lease.release();

    expect(onLeaseClosed).toHaveBeenCalledWith(lease.sessionId);
  });
});
