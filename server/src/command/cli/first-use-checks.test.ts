/**
 * The checks that run in the first seconds of init, setup and verify.
 *
 * Each problem below was found late, or never: Node older than `engines` failed deep inside an
 * install, a blocked Chromium download stopped the first lease, a Windows PATH without `npx.cmd`
 * gave an agent zero tools, and a bridge port held by another program stopped init only after the
 * whole dependency install. Each check prints one line with its one fix, and prints nothing when it
 * passes.
 */
import { describe, expect, it } from 'vitest';
import { ReticleEnv } from '@reticlehq/core';
import { PortPresence } from '@/command/daemon/binding/port-presence.js';
import {
  chromiumMissingLine,
  firstUseWarnings,
  nodeTooOldLine,
  windowsNpxLine,
  type FirstUseFacts,
} from './first-use-checks.js';

const FOUND_CHROMIUM = { executablePath: '/pw/chromium-1/chrome', exists: true } as const;

function facts(over: Partial<FirstUseFacts> = {}): FirstUseFacts {
  return {
    nodeVersion: '22.14.0',
    nodeRange: '>=20.11',
    platform: 'darwin',
    env: {},
    nodeDir: '/usr/local/bin',
    exists: () => false,
    chromium: () => Promise.resolve(FOUND_CHROMIUM),
    ...over,
  };
}

describe('the Node.js version check', () => {
  it('names the floor from engines, the running version and the fix', () => {
    const line = nodeTooOldLine('20.10.0', '>=20.11');
    expect(line).toContain('20.11');
    expect(line).toContain('20.10.0');
    expect(line).toContain('https://nodejs.org');
  });

  it('says nothing at or above the floor, or when the range is not a plain floor', () => {
    expect(nodeTooOldLine('20.11.0', '>=20.11')).toBeUndefined();
    expect(nodeTooOldLine('22.14.0', '>=20.11')).toBeUndefined();
    expect(nodeTooOldLine('18.0.0', undefined)).toBeUndefined();
    expect(nodeTooOldLine('18.0.0', '^20 || ^22')).toBeUndefined();
  });
});

describe('the Chromium check', () => {
  it('says nothing when the bundled build or an installed Chrome is there', () => {
    expect(chromiumMissingLine(FOUND_CHROMIUM)).toBeUndefined();
    expect(
      chromiumMissingLine({ executablePath: '/x', exists: false, fallback: 'Google Chrome' }),
    ).toBeUndefined();
  });

  it('names the download and RETICLE_CHROMIUM_PATH when no browser is on the machine', () => {
    const line = chromiumMissingLine({ executablePath: '/pw/chromium-1/chrome', exists: false });
    expect(line).toContain('download');
    expect(line).toContain(ReticleEnv.CHROMIUM_PATH);
  });

  it('uses the RETICLE_CHROMIUM_PATH refusal when that path cannot be launched', () => {
    const line = chromiumMissingLine({
      executablePath: '/nope/chrome',
      exists: false,
      configured: true,
      problem: 'missing',
    });
    expect(line).toContain(`${ReticleEnv.CHROMIUM_PATH} points at /nope/chrome`);
  });

  it('says nothing when playwright itself cannot be resolved; doctor names that', () => {
    expect(chromiumMissingLine({ exists: false })).toBeUndefined();
  });
});

describe('the Windows npx check', () => {
  const env = { Path: 'C:\\Windows;C:\\Program Files\\nodejs' };

  it('says nothing when npx.cmd is in a PATH folder', () => {
    const exists = (p: string): boolean => 'C:\\Program Files\\nodejs\\npx.cmd' === p;
    expect(windowsNpxLine('win32', env, 'C:\\Program Files\\nodejs', exists)).toBeUndefined();
  });

  it('names the folder to add to PATH when no PATH folder has npx.cmd', () => {
    const line = windowsNpxLine('win32', env, 'C:\\nvm\\v22', () => false);
    expect(line).toContain('npx.cmd');
    expect(line).toContain('C:\\nvm\\v22');
  });

  it('reads PATH under any letter case, as Windows does', () => {
    const exists = (p: string): boolean => 'C:\\node\\npx.cmd' === p;
    expect(windowsNpxLine('win32', { PATH: 'C:\\node' }, 'C:\\node', exists)).toBeUndefined();
  });

  it('never runs off Windows', () => {
    expect(windowsNpxLine('linux', {}, '/usr/bin', () => false)).toBeUndefined();
  });
});

describe('firstUseWarnings', () => {
  it('prints nothing on a machine where every check passes', async () => {
    expect(await firstUseWarnings(facts())).toEqual([]);
  });

  it('gives one line for each check that fails, in a fixed order', async () => {
    const lines = await firstUseWarnings(
      facts({
        nodeVersion: '20.0.0',
        platform: 'win32',
        env: { Path: 'C:\\x' },
        chromium: () => Promise.resolve({ executablePath: '/pw/c', exists: false }),
        port: 4400,
        portPresence: () => Promise.resolve(PortPresence.FOREIGN),
        describePort: () => 'port 4400 is held by another process',
      }),
    );
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('Node.js');
    expect(lines[1]).toContain('npx.cmd');
    expect(lines[2]).toContain(ReticleEnv.CHROMIUM_PATH);
    expect(lines[3]).toContain('port 4400');
    expect(lines.every((line) => !line.includes('\n'))).toBe(true);
  });

  it('accepts a port that is free or that a Reticle daemon holds', async () => {
    for (const presence of [PortPresence.FREE, PortPresence.DAEMON]) {
      const lines = await firstUseWarnings(
        facts({
          port: 4400,
          portPresence: () => Promise.resolve(presence),
          describePort: () => 'held',
        }),
      );
      expect(lines).toEqual([]);
    }
  });

  it('skips a probe that throws: a check never stops a path that would work', async () => {
    const lines = await firstUseWarnings(
      facts({
        chromium: () => Promise.reject(new Error('boom')),
        port: 4400,
        portPresence: () => Promise.reject(new Error('boom')),
        describePort: () => 'held',
      }),
    );
    expect(lines).toEqual([]);
  });
});
