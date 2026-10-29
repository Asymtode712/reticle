/**
 * An import-time module throw reaches the journal on a REAL Chromium.
 *
 * The unit tests prove the wiring with fakes; this one proves the assumption underneath them: a
 * module that throws while the page evaluates — the blank-page case (#1966) — fires Playwright's
 * `pageerror` DURING `goto`, before any SDK could be injected, and the pool's `onPageError` sink
 * receives the exception text. The journal buffers it for a session that connects later, and the
 * flush carries the message and the file:line the issue asks the agent to see.
 *
 * Heavy + Chromium-dependent, so it lives with the other integration tests (`pnpm test:integration`),
 * not in the fast unit gate.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:http';
import { EventType, type ReticleEvent } from '@reticlehq/core';
import {
  BrowserPool,
  makePageErrorJournal,
  playwrightLauncher,
  type JournalableSession,
  type Launcher,
} from '@reticlehq/server';

const immediate = (): Promise<void> => Promise.resolve();

const PAGE = `<!doctype html><title>throws at import</title><body>
<script type="module" src="/throws.js"></script>
</body>`;

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/throws.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end('throw new Error("boom at module evaluation");');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('a module that throws at import, on a leased page', () => {
  it('reaches the journal with its message and source even though no SDK was ever installed', async () => {
    // The session the SDK WOULD create once the zero-install reader connects — the error fires
    // before that, so the journal must buffer against the lease id until this appears.
    let session: JournalableSession | undefined;
    const events: ReticleEvent[] = [];
    const listeners: Array<(e: ReticleEvent) => void> = [];
    session = {
      id: 'sdk-session',
      url: `${baseUrl}?__reticle_session=lease-1`,
      pushEvent(event) {
        events.push(event);
        for (const listener of listeners) listener(event);
      },
      eventsSince: () => events,
      onEvent(listener) {
        listeners.push(listener);
        return () => undefined;
      },
    };

    const journal = makePageErrorJournal({
      // Resolving to the session from the start mirrors a lease taken on an origin whose tab is
      // already connected — the LIVE path. The buffered path is covered by the unit tests.
      resolveSession: () => session,
      sleep: immediate,
    });

    const pool = new BrowserPool(playwrightLauncher({ headless: true }), {
      maxContexts: 1,
      genSessionId: (): string => 'lease-1',
      onPageError: journal.onPoolPageError,
    });

    const lease = await pool.acquire(`${baseUrl}?__reticle_session=lease-1`);
    // The dedupe window is real here (50ms), so give the deferred write time to commit.
    await wait(300);
    await lease.release();
    await pool.shutdown();

    const errors = events.filter((e) => e.type === EventType.CONSOLE_ERROR);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const first = errors[0];
    if (first === undefined) {
      throw new Error('expected at least one journaled page error');
    }
    expect(first.data['message']).toBe('boom at module evaluation');
    expect(first.data['kind']).toBe('pageerror');
    expect(first.data['stack']).toContain('/throws.js');
    expect(first.data['source']).toContain('/throws.js');
  });
});
