import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ReplayStatus, type FlowReplayResult } from '@reticlehq/core';
import { ReticleTool } from '@reticlehq/core';
import { BrowserPool, type Launcher } from '@/portal/pool/browser-pool.js';
import type { ToolDeps } from '@/surface/tools/tools.js';

const persistSpy = vi.fn().mockResolvedValue('run-id-001');

vi.mock('../../judgement/runs/verification-sync.js', () => ({
  persistAndSyncVerificationRun: (...args: unknown[]): Promise<string> =>
    persistSpy(...args) as Promise<string>,
}));

vi.mock('./flow-replay-run.js', () => ({
  replayNamedFlow: (_deps: unknown, args: Record<string, unknown>): Promise<FlowReplayResult> =>
    Promise.resolve({
      name: (args['flowName'] as string) ?? '',
      status: ReplayStatus.OK,
      steps: [{ step: 0, tool: 'click', anchor: 'button', ok: true }],
    }),
  sessionProjectId: () => 'proj-123',
  flowErrorMessage: () => 'error',
  latestRecordedFlow: () => undefined,
}));

vi.mock('./suite/server-verify.js', () => ({
  runServerVerify: () => Promise.resolve(null),
}));

vi.mock('../../memory/cloud/cloud-config.js', () => ({
  resolveProjectCloud: () =>
    Promise.resolve({ config: null, policy: { memory: false, runs: false } }),
}));

const { FLOW_TOOLS } = await import('./flow-tools.js');
const { TOOLS } = await import('@/surface/tools/tools.js');

/**
 * The parallel path in `flow_verify` must persist a `ReticleVerificationRun` artifact — the same one
 * the sequential path produces. Without it, teams using `parallel:N` get zero entries in the Runs tab
 * and `reticle_run_export` returns nothing.
 *
 * This wiring test drives the handler with a mocked pool and asserts the persist call fires with the
 * correct `TimedReplay[]` shape. It does NOT test the content of the artifact (that's in
 * verification-sync.test.ts) — only that the parallel path calls the function at all.
 */
describe('parallel flow_verify persists a verification run artifact', () => {
  const verify = FLOW_TOOLS.find((t) => t.name === ReticleTool.FLOW_VERIFY);
  if (verify === undefined) throw new Error('flow_verify not found in FLOW_TOOLS');

  let deps: ToolDeps;

  beforeEach(() => {
    persistSpy.mockClear();
    const fakePool = {
      acquire: (_url: string, opts: { sessionId: string }) =>
        Promise.resolve({ sessionId: opts.sessionId, release: () => Promise.resolve() }),
      capacity: () => 4,
      activeCount: () => 0,
      queuedCount: () => 0,
    };
    deps = {
      pool: fakePool,
      now: (() => {
        let t = 1000;
        return () => (t += 50);
      })(),
      fs: { readFile: () => Promise.reject(new Error('no')), writeFile: () => Promise.resolve() },
      reticleRoot: '/tmp/reticle-test/.reticle',
      sessions: {
        resolve: () => ({ url: 'http://localhost:3000/app', projectId: 'proj-123' }),
        get: () => ({}),
      },
      flows: {
        list: () => Promise.resolve(['checkout', 'login']),
        load: () => Promise.resolve({ ok: true, value: { steps: [], success: undefined } }),
      },
      project: { recordRun: () => Promise.resolve() },
    } as unknown as ToolDeps;
  });

  it.each([
    { sessionId: undefined, sourceIgnores: true, expected: { ignoreHTTPSErrors: true } },
    { sessionId: 'source-alias', sourceIgnores: true, expected: { ignoreHTTPSErrors: true } },
    { sessionId: undefined, sourceIgnores: false, expected: undefined },
  ])(
    'inherits the source lease certificate setting: $sourceIgnores, sessionId: $sessionId',
    async ({ sessionId, sourceIgnores, expected }) => {
      const contexts: unknown[] = [];
      const launcher: Launcher = () =>
        Promise.resolve({
          newContext: (options) => {
            contexts.push(options);
            return Promise.resolve({
              newPage: () =>
                Promise.resolve({
                  goto: () => Promise.resolve(),
                  close: () => Promise.resolve(),
                  onCrash: () => undefined,
                }),
              close: () => Promise.resolve(),
            });
          },
          close: () => Promise.resolve(),
          onDisconnected: () => undefined,
          isConnected: () => true,
        });
      const pool = new BrowserPool(launcher, {
        maxContexts: 3,
        genSessionId: () => 'pool-generated',
      });
      try {
        await pool.acquire('https://localhost:3000/app', {
          sessionId: 'source',
          ignoreHTTPSErrors: sourceIgnores,
        });
        pool.alias('source-alias', 'source');
        deps.pool = pool;
        deps.sessions.resolve = () =>
          ({
            id: 'source-alias',
            url: 'https://localhost:3000/app',
            projectId: 'proj-123',
          }) as ReturnType<ToolDeps['sessions']['resolve']>;
        await verify.handler(deps, { parallel: 2, sessionId });
        expect(contexts).toEqual([expected, expected, expected]);
        expect(pool.activeCount()).toBe(1);
      } finally {
        await pool.shutdown();
      }
    },
  );

  it.each([true, false, undefined])(
    'accepts ignoreHTTPSErrors %s through reticle_verify without a source lease',
    async (ignoreHTTPSErrors) => {
      const publicVerify = TOOLS.find((tool) => tool.name === ReticleTool.VERIFY);
      if (publicVerify === undefined) {
        throw new Error('reticle_verify not found');
      }
      const acquire = vi.fn((_url: string, opts: { sessionId: string }) =>
        Promise.resolve({ sessionId: opts.sessionId, release: () => Promise.resolve() }),
      );
      deps.pool = {
        acquire,
        capacity: () => 4,
        ignoresHTTPSErrors: () => false,
      } as unknown as BrowserPool;
      const args = z.object(publicVerify.inputSchema).parse({
        action: 'flows',
        parallel: 2,
        ignoreHTTPSErrors,
      });
      if (ignoreHTTPSErrors !== undefined) {
        expect(args).toHaveProperty('ignoreHTTPSErrors', ignoreHTTPSErrors);
      }
      await publicVerify.handler(deps, args);
      expect(acquire).toHaveBeenCalledTimes(2);
      for (const [, options] of acquire.mock.calls) {
        if (true === ignoreHTTPSErrors) {
          expect(options).toHaveProperty('ignoreHTTPSErrors', true);
        } else {
          expect(options).not.toHaveProperty('ignoreHTTPSErrors');
        }
      }
    },
  );

  it('keeps certificate checks on when verify explicitly overrides the source lease', async () => {
    const acquire = vi.fn((_url: string, opts: { sessionId: string }) =>
      Promise.resolve({ sessionId: opts.sessionId, release: () => Promise.resolve() }),
    );
    deps.pool = {
      acquire,
      capacity: () => 4,
      ignoresHTTPSErrors: () => true,
    } as unknown as BrowserPool;
    await verify.handler(deps, { parallel: 2, ignoreHTTPSErrors: false });
    expect(acquire).toHaveBeenCalledTimes(2);
    for (const [, options] of acquire.mock.calls) {
      expect(options).not.toHaveProperty('ignoreHTTPSErrors');
    }
  });

  it('calls persistAndSyncVerificationRun when the parallel path runs', async () => {
    const result = await verify.handler(deps, { parallel: 2 });
    expect(persistSpy).toHaveBeenCalledOnce();
    const [, timed, target] = persistSpy.mock.calls[0] as [
      unknown,
      unknown[],
      { projectId: string; origin?: string },
    ];
    // The project AND the origin it was served from: the run lands in the checkout that served it.
    expect(target).toEqual({ projectId: 'proj-123', origin: 'http://localhost:3000' });
    expect(timed).toHaveLength(2);
    expect(result).toHaveProperty('status');
    // Named in the answer, so whoever ran the suite can tie its check to the run.
    expect(result).toHaveProperty('runId', 'run-id-001');
  });

  it('builds TimedReplay[] with durationMs from the injected clock', async () => {
    await verify.handler(deps, { parallel: 2, names: ['checkout'] });
    const [, timed] = persistSpy.mock.calls[0] as [unknown, Array<{ durationMs: number }>];
    expect(timed[0]?.durationMs).toBeGreaterThan(0);
  });

  it('passes projectId to acquireLeasedSession so leased tabs carry __reticle_project', async () => {
    const acquireUrls: string[] = [];
    const fakePool = {
      acquire: (url: string, opts: { sessionId: string }) => {
        acquireUrls.push(url);
        return Promise.resolve({ sessionId: opts.sessionId, release: () => Promise.resolve() });
      },
      capacity: () => 4,
      activeCount: () => 0,
      queuedCount: () => 0,
    };
    (deps as unknown as Record<string, unknown>)['pool'] = fakePool;
    await verify.handler(deps, { parallel: 2, names: ['checkout'] });
    expect(acquireUrls[0]).toContain('__reticle_project=proj-123');
  });
});

vi.mock('./flow-learning.js', () => {
  const replayed = (_deps: unknown, args: Record<string, unknown>): Promise<FlowReplayResult> =>
    Promise.resolve({
      name: (args['flowName'] as string) ?? '',
      status: ReplayStatus.OK,
      steps: [],
    });
  return { replayAndLearn: replayed, replaySeededOrNot: replayed };
});

/** The platform's Re-verify replayed one flow and got no run back, so its issue never resolved. */
describe('a single replay', () => {
  it('is written down as a run and names it', async () => {
    persistSpy.mockClear();
    const replay = FLOW_TOOLS.find((t) => t.name === ReticleTool.FLOW_REPLAY);
    const deps = {
      now: () => 1000,
      sessions: { resolve: () => ({ url: 'http://localhost:3000/', projectId: 'proj-123' }) },
    } as unknown as ToolDeps;
    const result = await replay?.handler(deps, { flowName: 'place-order' });
    expect(persistSpy).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ name: 'place-order', runId: 'run-id-001' });
  });
});
