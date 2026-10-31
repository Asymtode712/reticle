import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ElementState } from '@reticlehq/core';
import { matchQuery } from './query.js';

/**
 * `visible` means rendered and in layout. A fixed header over a close button leaves it `visible`
 * while a user cannot tap it. `receivesPointer` asks the question the user's finger asks: does a
 * pointer at the element's hit point reach it. It reuses the hit-test that `act` reports `occluded`
 * from (`occlusion.ts`), so the two cannot disagree.
 *
 * jsdom has no layout: the box and the hit-test are stubbed per case (the window is 1024x768).
 */
function mountButton(): HTMLButtonElement {
  document.body.innerHTML = '<header id="bar">Header</header><button id="close">Close</button>';
  const button = document.getElementById('close') as HTMLButtonElement;
  button.getBoundingClientRect = (): DOMRect => new DOMRect(900, 10, 40, 40);
  return button;
}

function topElementIs(el: Element | null): void {
  Object.defineProperty(document, 'elementFromPoint', {
    value: () => el,
    configurable: true,
    writable: true,
  });
}

const stateOf = (state: ElementState): boolean =>
  matchQuery({ role: 'button', name: 'Close' }, state).matched;

describe('receivesPointer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('is false under a fixed header while `visible` stays true', () => {
    mountButton();
    topElementIs(document.getElementById('bar'));
    expect(stateOf(ElementState.VISIBLE)).toBe(true);
    expect(stateOf(ElementState.RECEIVES_POINTER)).toBe(false);
  });

  it('is true once the button is clear of the header', () => {
    const button = mountButton();
    topElementIs(button);
    expect(stateOf(ElementState.VISIBLE)).toBe(true);
    expect(stateOf(ElementState.RECEIVES_POINTER)).toBe(true);
  });

  it('is true when a child of the button is on top', () => {
    const button = mountButton();
    const icon = document.createElement('span');
    button.append(icon);
    topElementIs(icon);
    expect(stateOf(ElementState.RECEIVES_POINTER)).toBe(true);
  });

  it("is true when only Reticle's own UI covers the button", () => {
    mountButton();
    const hud = document.createElement('div');
    hud.setAttribute('data-reticle-overlay', '');
    document.body.append(hud);
    topElementIs(hud);
    expect(stateOf(ElementState.RECEIVES_POINTER)).toBe(true);
  });

  it('is false for a hidden button, whatever is on top', () => {
    const button = mountButton();
    button.hidden = true;
    topElementIs(button);
    expect(stateOf(ElementState.RECEIVES_POINTER)).toBe(false);
  });

  it('is false for a button outside the viewport', () => {
    const button = mountButton();
    button.getBoundingClientRect = (): DOMRect => new DOMRect(900, 5000, 40, 40);
    topElementIs(button);
    expect(stateOf(ElementState.RECEIVES_POINTER)).toBe(false);
  });

  it('falls back to `visible` when the page has no layout to hit-test', () => {
    const button = document.createElement('button');
    button.textContent = 'Close';
    document.body.append(button);
    expect(stateOf(ElementState.RECEIVES_POINTER)).toBe(true);
  });
});
