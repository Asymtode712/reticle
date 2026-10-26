import { describe, expect, it } from 'vitest';
import { ActionType } from '@reticlehq/core';
import type { Page } from 'playwright';
import { performGesture } from './real-input.js';

/** Records keyboard and mouse calls in one ordered list, so a held key can be seen around a click. */
function recordingPage(): { page: Page; calls: string[] } {
  const calls: string[] = [];
  const page = {
    keyboard: {
      down: (key: string) => {
        calls.push(`down:${key}`);
        return Promise.resolve();
      },
      up: (key: string) => {
        calls.push(`up:${key}`);
        return Promise.resolve();
      },
    },
    mouse: {
      move: () => Promise.resolve(),
      click: (_x: number, _y: number, opts?: { button?: string }) => {
        calls.push(`click:${opts?.button ?? 'default'}`);
        return Promise.resolve();
      },
      dblclick: (_x: number, _y: number, opts?: { button?: string }) => {
        calls.push(`dblclick:${opts?.button ?? 'default'}`);
        return Promise.resolve();
      },
    },
  } as unknown as Page;
  return { page, calls };
}

const BOX = { x: 0, y: 0, width: 10, height: 10 };
const noSleep = (): Promise<void> => Promise.resolve();

describe('performGesture: a real click with modifiers and a button', () => {
  it('holds each modifier down around the click and releases in reverse', async () => {
    const { page, calls } = recordingPage();
    await performGesture(page, ActionType.CLICK, BOX, { modifiers: ['Shift', 'cmd'] }, noSleep);
    expect(calls).toEqual(['down:Meta', 'down:Shift', 'click:default', 'up:Shift', 'up:Meta']);
  });

  it('releases the modifiers when the click throws', async () => {
    const { page, calls } = recordingPage();
    (page.mouse as { click: unknown }).click = () => Promise.reject(new Error('boom'));
    await expect(
      performGesture(page, ActionType.CLICK, BOX, { modifiers: ['Shift'] }, noSleep),
    ).rejects.toThrow('boom');
    expect(calls).toEqual(['down:Shift', 'up:Shift']);
  });

  it('passes the button through to the mouse', async () => {
    const { page, calls } = recordingPage();
    await performGesture(page, ActionType.CLICK, BOX, { button: 'right' }, noSleep);
    expect(calls).toEqual(['click:right']);
  });

  it('holds modifiers around a dblclick', async () => {
    const { page, calls } = recordingPage();
    await performGesture(page, ActionType.DBLCLICK, BOX, { modifiers: ['Alt'] }, noSleep);
    expect(calls).toEqual(['down:Alt', 'dblclick:default', 'up:Alt']);
  });
});
