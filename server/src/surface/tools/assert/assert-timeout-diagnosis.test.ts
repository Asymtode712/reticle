import { describe, expect, it } from 'vitest';
import { RecordingStore } from '@/language/flows/recording/tape/recordings.js';
import { Verified } from '@reticlehq/core';
import { TOOLS, type ToolDef, type ToolDeps } from '@/surface/tools/tools.js';
import { ReticleTool } from '@reticlehq/core';
import type { SessionManager } from '@/portal/session/session-manager.js';
import type { Session } from '@/portal/session/session.js';
import { createFakeSession } from '@/portal/session/fake-session.js';

/**
 * An `unknown` verdict after a timed-out page read names its cause and the one fix (#1990):
 * `reticle update` when the page's SDK is behind this daemon, `timeout_ms` otherwise.
 */
const call = (session: Session): Promise<Record<string, unknown>> =>
  (TOOLS.find((t) => t.name === ReticleTool.ASSERT) as ToolDef).handler(
    {
      sessions: { resolve: () => session } as unknown as SessionManager,
      recordings: new RecordingStore(),
    } as unknown as ToolDeps,
    { predicate: { kind: 'element', role: 'button', name: 'Save' }, timeout_ms: 30 },
  ) as Promise<Record<string, unknown>>;

describe('a verdict whose page read timed out', () => {
  it('names the budget that ran out, and how to widen it, on a current page', async () => {
    const session = createFakeSession({
      command(_n: string, _a?: Record<string, unknown>, t?: number) {
        return Promise.reject(new Error(`command 'match' timed out after ${String(t)}ms`));
      },
    });
    const result = await call(session);
    expect(result.verified).toBe(Verified.UNKNOWN);
    expect(String(result.because)).toContain("bounded by what the assertion's budget had left");
    expect(String(result.because)).toContain('timeout_ms');
  });

  it('names an old page SDK and the update ahead of any budget advice', async () => {
    const result = await call(
      createFakeSession({
        sdkVersion: '3.6.2',
        command() {
          return Promise.reject(new Error("command 'match' timed out after 2679ms"));
        },
      }),
    );
    expect(result.verified).toBe(Verified.UNKNOWN);
    expect(String(result.because)).toContain('3.6.2');
    expect(String(result.because)).toContain('reticle update');
    expect(String(result.because)).not.toContain('timeout_ms');
  });

  it('leaves a reason that is not a command timeout alone', async () => {
    const session = createFakeSession({
      command() {
        return Promise.reject(new Error('this session was replaced by a newer connection'));
      },
    });
    expect(String((await call(session)).because)).not.toContain('budget');
  });
});
