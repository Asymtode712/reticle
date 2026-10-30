/**
 * The command must come from the PROJECT, never from a guess.
 *
 * "Ask the human to start it (`npm run dev`)" is in the no-session prose today and it is a guess:
 * plenty of repos have no `dev` script, and plenty use pnpm or yarn. A command that does not exist
 * is worse than no command, because the agent runs it, gets an error about the wrong thing, and
 * concludes the app is broken.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { isWebApp } from '@reticlehq/init';
import {
  childDevApps,
  detectDevCommand,
  detectDevCommandInProject,
  initCommandIn,
} from './dev-command.js';

/** A reader over an in-memory tree — the real one reads the disk. */
function reader(files: Record<string, string>): (path: string) => string | undefined {
  return (path) => files[path];
}

/**
 * Fixture paths are built with `join`, the same way the code under test builds them.
 *
 * Hard-coded POSIX keys made this suite fail on Windows and nowhere else: `join('/app', 'x')`
 * yields `\app\x` there, which matched no key in the in-memory tree, so every lookup returned
 * undefined and the detector correctly reported that it had found nothing.
 */
const DIR = '/app';
const at = (file: string): string => join(DIR, file);
const PKG = at('package.json');

describe('detectDevCommand', () => {
  it('returns no command at all when there is no package.json', () => {
    expect(detectDevCommand(DIR, reader({}))).toBeUndefined();
  });

  it('returns no command when package.json has no recognisable dev script', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { build: 'tsc', test: 'vitest' } }) };
    expect(detectDevCommand(DIR, reader(files))).toBeUndefined();
  });

  it('returns no command when package.json is unparseable rather than guessing one', () => {
    expect(detectDevCommand(DIR, reader({ [PKG]: '{ not json' }))).toBeUndefined();
  });

  it('defaults to npm when no lockfile identifies a package manager', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { dev: 'vite' } }) };
    expect(detectDevCommand(DIR, reader(files))?.command).toBe('npm run dev');
  });

  it('reads pnpm from pnpm-lock.yaml', () => {
    const files = {
      [PKG]: JSON.stringify({ scripts: { dev: 'vite' } }),
      [at('pnpm-lock.yaml')]: 'lockfileVersion: 9.0',
    };
    expect(detectDevCommand(DIR, reader(files))?.command).toBe('pnpm run dev');
  });

  it('reads yarn from yarn.lock', () => {
    const files = {
      [PKG]: JSON.stringify({ scripts: { dev: 'vite' } }),
      [at('yarn.lock')]: '# yarn lockfile v1',
    };
    expect(detectDevCommand(DIR, reader(files))?.command).toBe('yarn run dev');
  });

  it('prefers pnpm over yarn when a repo carries both lockfiles', () => {
    const files = {
      [PKG]: JSON.stringify({ scripts: { dev: 'vite' } }),
      [at('pnpm-lock.yaml')]: '',
      [at('yarn.lock')]: '',
    };
    expect(detectDevCommand(DIR, reader(files))?.command).toBe('pnpm run dev');
  });

  it('prefers `dev` over `develop` and `start`', () => {
    const scripts = { start: 'next start', develop: 'gatsby develop', dev: 'next dev' };
    const found = detectDevCommand(DIR, reader({ [PKG]: JSON.stringify({ scripts }) }));
    expect(found?.script).toBe('dev');
  });

  it('falls back to `develop` before `start` — `start` is usually the PRODUCTION server', () => {
    const scripts = { start: 'next start', develop: 'gatsby develop' };
    const found = detectDevCommand(DIR, reader({ [PKG]: JSON.stringify({ scripts }) }));
    expect(found?.script).toBe('develop');
  });

  it('accepts `start` when it is the only script there is', () => {
    const found = detectDevCommand(
      '/app',
      reader({ [PKG]: JSON.stringify({ scripts: { start: 'react-scripts start' } }) }),
    );
    expect(found?.command).toBe('npm run start');
  });

  it('reports the port when the script pins one with --port', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { dev: 'vite --port 4311' } }) };
    expect(detectDevCommand(DIR, reader(files))?.port).toBe(4311);
  });

  it('reports the port from --port=N as well as --port N', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { dev: 'next dev --port=3001' } }) };
    expect(detectDevCommand(DIR, reader(files))?.port).toBe(3001);
  });

  it('reports the port when the script pins one with the short -p flag', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { dev: 'next dev -p 3005' } }) };
    expect(detectDevCommand(DIR, reader(files))?.port).toBe(3005);
  });

  it('does not read a port out of the -p inside a longer flag', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { dev: 'vite --pretty 2' } }) };
    expect(detectDevCommand(DIR, reader(files))?.port).toBeUndefined();
  });

  it('reports the port from a PORT= env prefix', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { dev: 'PORT=8080 remix dev' } }) };
    expect(detectDevCommand(DIR, reader(files))?.port).toBe(8080);
  });

  it('reports NO port when the script pins none, rather than inventing the framework default', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { dev: 'vite' } }) };
    expect(detectDevCommand(DIR, reader(files))?.port).toBeUndefined();
  });

  it('ignores a scripts value that is not a string', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { dev: 42 } }) };
    expect(detectDevCommand(DIR, reader(files))).toBeUndefined();
  });

  it('ignores an empty dev script — a command of "" is not runnable', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { dev: '  ' } }) };
    expect(detectDevCommand(DIR, reader(files))).toBeUndefined();
  });

  // A desktop project's `dev` is its renderer's dev server (plain `vite` on the Tauri template):
  // handing that over starts a server no window ever opens onto. Same rule init uses.
  it('hands a Tauri project its own launcher, not the renderer dev server', () => {
    const files = {
      [PKG]: JSON.stringify({
        scripts: { dev: 'vite', tauri: 'tauri' },
        devDependencies: { '@tauri-apps/cli': '^2' },
      }),
      [at('pnpm-lock.yaml')]: '',
    };
    expect(detectDevCommand(DIR, reader(files))).toEqual({
      command: 'pnpm run tauri dev',
      script: 'tauri',
    });
  });

  it('runs the Tauri CLI directly when no script names it, and claims no script', () => {
    const files = {
      [PKG]: JSON.stringify({
        scripts: { dev: 'vite' },
        devDependencies: { '@tauri-apps/cli': '^2' },
      }),
    };
    expect(detectDevCommand(DIR, reader(files))).toEqual({ command: 'npx tauri dev' });
  });
});

/**
 * The app is one directory down, and the command has to say so.
 *
 * Reported from the field: a repo whose web app lives in `frontend/` was told "this project declares
 * no dev script", and the agent asked a human for a command that was sitting in `frontend/package.json`
 * the whole time (reticle#1368).
 */
describe('detectDevCommandInProject', () => {
  const ROOT = join(DIR, '.');
  const listing =
    (entries: Record<string, string[]>): ((path: string) => readonly string[]) =>
    (path) =>
      entries[path] ?? [];

  it('finds an app one directory down and names the directory', () => {
    const files = {
      [PKG]: JSON.stringify({ name: 'repo', private: true }),
      [at('frontend/package.json')]: JSON.stringify({
        scripts: { dev: 'vite' },
        devDependencies: { vite: '^7.0.0' },
      }),
    };
    expect(
      detectDevCommandInProject(DIR, reader(files), listing({ [ROOT]: ['frontend'] }), () => true),
    ).toEqual({
      command: 'npm run dev',
      script: 'dev',
      directory: 'frontend',
    });
  });

  it('keeps the root command when the root has one', () => {
    const files = { [PKG]: JSON.stringify({ scripts: { dev: 'vite' } }) };
    expect(
      detectDevCommandInProject(DIR, reader(files), listing({ [ROOT]: ['frontend'] })),
    ).toEqual({ command: 'npm run dev', script: 'dev' });
  });

  it('uses the root lockfile for the app in a subdirectory', () => {
    const files = {
      [PKG]: JSON.stringify({}),
      [at('pnpm-lock.yaml')]: '',
      [at('frontend/package.json')]: JSON.stringify({
        scripts: { dev: 'vite' },
        devDependencies: { vite: '^7.0.0' },
      }),
    };
    expect(
      detectDevCommandInProject(DIR, reader(files), listing({ [ROOT]: ['frontend'] }), () => true),
    ).toEqual({
      command: 'pnpm run dev',
      script: 'dev',
      directory: 'frontend',
    });
  });

  it('stays undefined when no directory has a dev script', () => {
    const files = {
      [PKG]: JSON.stringify({ scripts: { build: 'tsc' } }),
      [at('frontend/package.json')]: JSON.stringify({ scripts: { test: 'vitest' } }),
    };
    expect(
      detectDevCommandInProject(DIR, reader(files), listing({ [ROOT]: ['frontend'] })),
    ).toBeUndefined();
  });

  it('picks the web workspace package over a backend workspace package', () => {
    const files = {
      [PKG]: JSON.stringify({ name: 'repo', workspaces: ['packages/*'] }),
      [at('packages/api/package.json')]: JSON.stringify({
        scripts: { dev: 'nest start' },
        dependencies: { '@nestjs/core': '^10.0.0' },
      }),
      [at('packages/web/package.json')]: JSON.stringify({
        scripts: { dev: 'vite' },
        devDependencies: { vite: '^7.0.0' },
      }),
    };
    const dirs = listing({
      [ROOT]: ['packages'],
      [join(DIR, 'packages')]: ['api', 'web'],
    });
    expect(detectDevCommandInProject(DIR, reader(files), dirs, () => true)).toEqual({
      command: 'npm run dev',
      script: 'dev',
      directory: 'packages/web',
    });
  });
});

/**
 * The command an agent runs to wire THIS app for good, without a global install.
 *
 * The MCP-only install route (a plugin, a hand-written `npx … mcp` config) never runs `init`, so the
 * no-session answer has to hand the agent the command itself — in the app's folder, through the
 * runner the project's own package manager provides. `init` run in a folder that is not the app is
 * the commonest way init fails.
 */
describe('initCommandIn', () => {
  const ROOT = join(DIR, '.');
  const none = (): readonly string[] => [];
  const DEV_PKG = JSON.stringify({ scripts: { dev: 'vite' } });

  it('runs through npx when no lockfile names a manager', () => {
    expect(initCommandIn(DIR, reader({ [PKG]: DEV_PKG }), none)).toBe('npx @reticlehq/server init');
  });

  it('runs through pnpm dlx in a pnpm project', () => {
    const files = { [PKG]: DEV_PKG, [at('pnpm-lock.yaml')]: '' };
    expect(initCommandIn(DIR, reader(files), none)).toBe('pnpm dlx @reticlehq/server init');
  });

  it('runs through bunx in a bun project, and starts the dev server with bun', () => {
    const files = { [PKG]: DEV_PKG, [at('bun.lock')]: '' };
    expect(initCommandIn(DIR, reader(files), none)).toBe('bunx @reticlehq/server init');
    expect(detectDevCommand(DIR, reader(files))?.command).toBe('bun run dev');
  });

  it('runs through yarn dlx only on a yarn that has dlx (Berry); classic yarn gets npx', () => {
    const classic = { [PKG]: DEV_PKG, [at('yarn.lock')]: '' };
    const berry = { ...classic, [at('.yarnrc.yml')]: '' };
    expect(initCommandIn(DIR, reader(classic), none)).toBe('npx @reticlehq/server init');
    expect(initCommandIn(DIR, reader(berry), none)).toBe('yarn dlx @reticlehq/server init');
  });

  it('names the app folder when the app is one directory down', () => {
    const files = {
      [PKG]: JSON.stringify({ name: 'repo', private: true }),
      [at('pnpm-lock.yaml')]: '',
      [at('web/package.json')]: DEV_PKG,
    };
    const listing = (path: string): readonly string[] => (path === ROOT ? ['web'] : []);
    expect(initCommandIn(DIR, reader(files), listing, () => true)).toBe(
      'cd web && pnpm dlx @reticlehq/server init',
    );
  });
});

/**
 * A task folder holds the app one level down and has no package.json of its own: no workspace file
 * lists the child, so it was never found and the agent was told the project has no dev script.
 */
describe('a folder with no package.json and child apps', () => {
  // The code lists `DIR` as given. On Windows, `join` turns `/app` into `\\app`, the form of `ROOT`.
  const ROOT = join(DIR, '.');
  const listing =
    (entries: Record<string, string[]>): ((path: string) => readonly string[]) =>
    (path) =>
      entries[join(path)] ?? [];
  const app = (script = 'dev'): string =>
    JSON.stringify({ scripts: { [script]: 'vite' }, devDependencies: { vite: '^7.0.0' } });
  const backend = (): string =>
    JSON.stringify({
      scripts: { dev: 'nest start' },
      dependencies: { '@nestjs/core': '^10.0.0' },
    });
  const writable = (): boolean => true;

  it('finds the one child app, its command and its directory', () => {
    const files = { [at('MagicBook/package.json')]: app() };
    expect(
      detectDevCommandInProject(DIR, reader(files), listing({ [ROOT]: ['MagicBook'] }), writable),
    ).toEqual({ command: 'npm run dev', script: 'dev', directory: 'MagicBook' });
  });

  it('uses the child own lockfile for the package manager', () => {
    const files = {
      [at('MagicBook/package.json')]: app(),
      [at('MagicBook/pnpm-lock.yaml')]: '',
    };
    expect(
      detectDevCommandInProject(DIR, reader(files), listing({ [ROOT]: ['MagicBook'] }), writable)
        ?.command,
    ).toBe('pnpm run dev');
  });

  it('chooses none when two children are apps, and names both', () => {
    const files = {
      [at('web/package.json')]: app(),
      [at('MagicBook/package.json')]: app(),
    };
    const dirs = listing({ [ROOT]: ['web', 'MagicBook'] });
    expect(detectDevCommandInProject(DIR, reader(files), dirs, writable)).toBeUndefined();
    expect(childDevApps(DIR, reader(files), dirs, writable)).toEqual(['MagicBook', 'web']);
  });

  it('picks the web app over a backend child that also has a dev script', () => {
    const files = {
      [at('backend/package.json')]: backend(),
      [at('web/package.json')]: app(),
    };
    const dirs = listing({ [ROOT]: ['backend', 'web'] });
    expect(detectDevCommandInProject(DIR, reader(files), dirs, writable)).toEqual({
      command: 'npm run dev',
      script: 'dev',
      directory: 'web',
    });
    expect(childDevApps(DIR, reader(files), dirs, writable)).toEqual(['web']);
  });

  it('skips a web app in a folder this process cannot write', () => {
    const files = { [at('web/package.json')]: app() };
    const dirs = listing({ [ROOT]: ['web'] });
    expect(childDevApps(DIR, reader(files), dirs, () => false)).toEqual([]);
    expect(detectDevCommandInProject(DIR, reader(files), dirs, () => false)).toBeUndefined();
  });

  it('still returns a child whose setup no detector recognises', () => {
    // The premise, pinned: a dev script and a page no detector reads as an app — a custom bundler
    // or a framework init does not know yet. Excluding it would take away the command this project
    // has always had, and the agent would have nothing to run at all.
    const files = {
      [at('custom/package.json')]: JSON.stringify({
        scripts: { dev: 'node server.js' },
        dependencies: { esbuild: '^0.19.0' },
      }),
    };
    const dirs = listing({ [ROOT]: ['custom'] });
    const io = {
      exists: (path: string): boolean => reader(files)(at(join('custom', path))) !== undefined,
      readFile: (path: string): string | null => reader(files)(at(join('custom', path))) ?? null,
    };
    expect(isWebApp('.', io)).toBe(false);
    expect(childDevApps(DIR, reader(files), dirs, writable)).toEqual(['custom']);
    expect(detectDevCommandInProject(DIR, reader(files), dirs, writable)).toEqual({
      command: 'npm run dev',
      script: 'dev',
      directory: 'custom',
    });
  });

  it('skips node_modules, hidden folders and folders that are not apps', () => {
    const files = {
      [at('node_modules/package.json')]: app(),
      [at('.cache/package.json')]: app(),
      [at('lib/package.json')]: JSON.stringify({ scripts: { build: 'tsc' } }),
      [at('docs/readme.md')]: 'no package.json here',
      [at('MagicBook/package.json')]: app(),
    };
    const dirs = listing({ [ROOT]: ['node_modules', '.cache', 'lib', 'docs', 'MagicBook'] });
    expect(childDevApps(DIR, reader(files), dirs, writable)).toEqual(['MagicBook']);
    expect(detectDevCommandInProject(DIR, reader(files), dirs, writable)?.directory).toBe(
      'MagicBook',
    );
  });

  it('childDevApps ignores a folder that has its own package.json', () => {
    const files = {
      [PKG]: JSON.stringify({ name: 'repo' }),
      [at('MagicBook/package.json')]: app(),
    };
    expect(childDevApps(DIR, reader(files), listing({ [ROOT]: ['MagicBook'] }), writable)).toEqual(
      [],
    );
  });

  it('points init at the child app', () => {
    const files = { [at('MagicBook/package.json')]: app() };
    expect(initCommandIn(DIR, reader(files), listing({ [ROOT]: ['MagicBook'] }), writable)).toBe(
      'cd MagicBook && npx @reticlehq/server init',
    );
  });
});
