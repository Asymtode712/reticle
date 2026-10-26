import { describe, it, expect, beforeEach } from 'vitest';
import { executeAction } from './actions.js';
import { refs } from '@/dom/addressing/refs.js';

beforeEach(() => {
  document.body.innerHTML = '<button>Row</button>';
});

function button(): HTMLButtonElement {
  return document.querySelector('button') as HTMLButtonElement;
}

function record(el: Element, types: string[]): MouseEvent[] {
  const seen: MouseEvent[] = [];
  for (const type of types) {
    el.addEventListener(type, (e) => seen.push(e as MouseEvent));
  }
  return seen;
}

describe('click: modifiers', () => {
  it('carries shiftKey and metaKey on every pointer, mouse and click event', async () => {
    const seen = record(button(), ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
    await executeAction(refs.refFor(button()), 'click', { modifiers: ['Shift', 'cmd'] });
    expect(seen).toHaveLength(5);
    for (const e of seen) {
      expect(e.shiftKey).toBe(true);
      expect(e.metaKey).toBe(true);
      expect(e.ctrlKey).toBe(false);
      expect(e.altKey).toBe(false);
    }
  });

  it('carries the modifiers on both clicks and the dblclick of a dblclick', async () => {
    const seen = record(button(), ['click', 'dblclick']);
    await executeAction(refs.refFor(button()), 'dblclick', { modifiers: ['Control'] });
    expect(seen.map((e) => e.type)).toEqual(['click', 'click', 'dblclick']);
    expect(seen.every((e) => e.ctrlKey)).toBe(true);
  });

  it('sends no modifier on a plain click', async () => {
    const seen = record(button(), ['click']);
    await executeAction(refs.refFor(button()), 'click');
    expect(seen[0]?.shiftKey).toBe(false);
  });

  it('refuses a modifier it does not know, before any event', async () => {
    const seen = record(button(), ['pointerdown', 'click']);
    await expect(
      executeAction(refs.refFor(button()), 'click', { modifiers: ['Hyper'] }),
    ).rejects.toThrow(/Hyper/);
    expect(seen).toHaveLength(0);
  });
});

describe('click: button', () => {
  it('a right click sends button 2, a contextmenu and an auxclick, and no click', async () => {
    const seen = record(button(), ['mousedown', 'contextmenu', 'mouseup', 'click', 'auxclick']);
    await executeAction(refs.refFor(button()), 'click', { button: 'right' });
    expect(seen.map((e) => e.type)).toEqual(['mousedown', 'contextmenu', 'mouseup', 'auxclick']);
    expect(seen.every((e) => 2 === e.button)).toBe(true);
    expect(seen[0]?.buttons).toBe(2);
    expect(seen[2]?.buttons).toBe(0);
  });

  it('reports a prevented contextmenu as defaultPrevented', async () => {
    button().addEventListener('contextmenu', (e) => e.preventDefault());
    const r = await executeAction(refs.refFor(button()), 'click', { button: 'right' });
    expect(r.effect.defaultPrevented).toBe(true);
  });

  it('a middle click sends button 1 and an auxclick', async () => {
    const seen = record(button(), ['mousedown', 'click', 'auxclick']);
    await executeAction(refs.refFor(button()), 'click', { button: 'middle' });
    expect(seen.map((e) => e.type)).toEqual(['mousedown', 'auxclick']);
    expect(seen.every((e) => 1 === e.button)).toBe(true);
  });

  it('refuses a button it does not know, before any event', async () => {
    const seen = record(button(), ['pointerdown']);
    await expect(executeAction(refs.refFor(button()), 'click', { button: 'back' })).rejects.toThrow(
      /button/,
    );
    expect(seen).toHaveLength(0);
  });

  it('refuses a right dblclick', async () => {
    await expect(
      executeAction(refs.refFor(button()), 'dblclick', { button: 'right' }),
    ).rejects.toThrow(/dblclick/);
  });
});
