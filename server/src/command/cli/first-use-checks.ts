/**
 * Four checks for the first seconds of `init`, `connect`, `setup` and `verify`: the Node.js version,
 * a browser to drive, `npx.cmd` on the Windows PATH, and the bridge port.
 *
 * Each failed check prints one line: the cause and its one fix. A passed check prints nothing. All
 * are warnings: the command goes on, so a check that is wrong can never block a path that works.
 * The paths that cannot go on still refuse later, in their own words (the lease preflight, the
 * init runtime phase).
 *
 * `reticle doctor --fix` would repair the two that a program can repair: install the Chromium, and
 * move init to a free port. That is a separate change.
 */

import { existsSync } from 'node:fs';
import { dirname, win32 } from 'node:path';
import { ReticleEnv } from '@reticlehq/core';
import { PortPresence, probePresence } from '@/command/daemon/binding/port-presence.js';
import { describePortState } from '@/command/daemon/port-state.js';
import { fetchStatus } from '@/command/daemon/binding/daemon-status-probe.js';
import { probeDaemon } from '@/surface/mcp/mcp-proxy.js';
import { probeChromiumWithFallback } from '@/launch-chromium.js';
import { compareVersions } from '@/command/version/version-skew.js';
import { SERVER_NODE_RANGE } from '@/command/version/identity/server-version.js';
import {
  ChromiumPathProblem,
  configuredChromiumRefusal,
  type ChromiumProbe,
} from './doctor/browser/chromium-hint.js';

/** What the checks read, injected so each one runs against a fake machine in tests. */
export interface FirstUseFacts {
  /** `process.versions.node`. */
  nodeVersion: string;
  /** The `engines.node` range of this package. */
  nodeRange: string | undefined;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /** The folder of the running `node` executable. */
  nodeDir: string;
  exists: (path: string) => boolean;
  chromium: () => Promise<ChromiumProbe>;
  /** The bridge port to check. No port: no port check. */
  port?: number;
  portPresence?: () => Promise<PortPresence>;
  describePort?: (presence: PortPresence, port: number) => string;
}

const WARNING_PREFIX = '⚠ ';
const NODE_DOWNLOAD_URL = 'https://nodejs.org';
/** Only a plain floor (`>=20.11`) is read. Any other range is not checked. */
const NODE_FLOOR = /^>=\s*(\d+(?:\.\d+)*)$/;
const NPX_WINDOWS = 'npx.cmd';
const PATH_KEY = 'path';
const WINDOWS_PATH_SEPARATOR = ';';
const WINDOWS = 'win32';

/** The line for a Node.js older than the `engines` floor, or undefined. */
export function nodeTooOldLine(version: string, range: string | undefined): string | undefined {
  const floor = range === undefined ? undefined : NODE_FLOOR.exec(range.trim())?.[1];
  if (floor === undefined) {
    return undefined;
  }
  const order = compareVersions(version, floor);
  if (order === undefined || order >= 0) {
    return undefined;
  }
  return (
    `Reticle needs Node.js ${floor} or later, and this is Node.js ${version}. ` +
    `Install the current Node.js LTS from ${NODE_DOWNLOAD_URL}, then run the command again.`
  );
}

/** The line for a machine with no browser Reticle can launch, or undefined. */
export function chromiumMissingLine(probe: ChromiumProbe): string | undefined {
  if (probe.exists || probe.fallback !== undefined) {
    return undefined;
  }
  if (true === probe.configured && probe.executablePath !== undefined) {
    return configuredChromiumRefusal(
      probe.executablePath,
      probe.problem ?? ChromiumPathProblem.MISSING,
    );
  }
  // No playwright at all is a broken install, not a blocked download. `reticle doctor` names it.
  if (probe.executablePath === undefined) {
    return undefined;
  }
  return (
    'No Chromium, Chrome or Edge is on this machine, so the first browser session downloads ' +
    'Chromium (about 150 MiB). If your network blocks that download, install Google Chrome, or set ' +
    `${ReticleEnv.CHROMIUM_PATH} to a Chromium executable.`
  );
}

/** The line for a Windows PATH with no `npx.cmd` on it, or undefined. */
export function windowsNpxLine(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  nodeDir: string,
  exists: (path: string) => boolean,
): string | undefined {
  if (WINDOWS !== platform) {
    return undefined;
  }
  // Windows reads environment names without letter case: `Path` and `PATH` are one variable.
  const key = Object.keys(env).find((name) => PATH_KEY === name.toLowerCase());
  const path = key === undefined ? '' : (env[key] ?? '');
  const onPath = path
    .split(WINDOWS_PATH_SEPARATOR)
    .map((dir) => dir.trim().replace(/^"|"$/g, ''))
    .some((dir) => dir.length > 0 && exists(win32.join(dir, NPX_WINDOWS)));
  if (onPath) {
    return undefined;
  }
  return (
    `${NPX_WINDOWS} is not on PATH, so your agent cannot start the Reticle MCP server with npx. ` +
    `Add ${nodeDir} to PATH, then open a new terminal.`
  );
}

/** Run a probe; a probe that fails gives no line. */
async function quietly<T>(probe: () => Promise<T>): Promise<T | undefined> {
  try {
    return await probe();
  } catch {
    return undefined;
  }
}

/** The warning lines, in a fixed order. Empty when every check passes. */
export async function firstUseWarnings(facts: FirstUseFacts): Promise<string[]> {
  const lines = [
    nodeTooOldLine(facts.nodeVersion, facts.nodeRange),
    windowsNpxLine(facts.platform, facts.env, facts.nodeDir, facts.exists),
  ];
  const probe = await quietly(facts.chromium);
  lines.push(probe === undefined ? undefined : chromiumMissingLine(probe));
  const { port, portPresence, describePort } = facts;
  if (port !== undefined && portPresence !== undefined && describePort !== undefined) {
    const presence = await quietly(portPresence);
    lines.push(PortPresence.FOREIGN === presence ? describePort(presence, port) : undefined);
  }
  return lines.flatMap((line) => (line === undefined ? [] : [`${WARNING_PREFIX}${line}`]));
}

/** This machine's facts. */
function thisMachine(port: number | undefined): FirstUseFacts {
  return {
    nodeVersion: process.versions.node,
    nodeRange: SERVER_NODE_RANGE,
    platform: process.platform,
    env: process.env,
    nodeDir: dirname(process.execPath),
    exists: existsSync,
    chromium: () => probeChromiumWithFallback(),
    ...(port === undefined
      ? {}
      : {
          port,
          portPresence: () => probePresence(port, { tcpOpen: probeDaemon, status: fetchStatus }),
          describePort: describePortState,
        }),
  };
}

/** Write the warnings for this machine to stderr. `port` adds the bridge port check. */
export async function writeFirstUseWarnings(port?: number): Promise<void> {
  for (const line of await firstUseWarnings(thisMachine(port))) {
    process.stderr.write(`${line}\n`);
  }
}
