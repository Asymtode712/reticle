import { describe, it, expect, beforeEach } from 'vitest';
import { executeAction } from './actions.js';
import { createCommandRegistry } from '@/commands/commands.js';
import { refs } from '@/dom/addressing/refs.js';
import { ActionType, INSPECT_REVEAL_ARG, ReticleCommand } from '@reticlehq/core';

/**
 * A page with `scroll-behavior: smooth` turns a bare `scrollIntoView()` into an animation. The call
 * returns with the element still off screen, so the next reading (inViewport, the click point, the
 * box a real pointer aims at) judges a button that is about to arrive as one that is outside the
 * viewport. Every scroll Reticle makes for its own reading must be instant.
 */
function belowTheFold(): { el: HTMLElement; options: () => ScrollIntoViewOptions | undefined } {
  document.body.innerHTML = '<button>Save</button>';
  const el = document.querySelector('button') as HTMLElement;
  let seen: ScrollIntoViewOptions | undefined;
  el.scrollIntoView = (arg?: boolean | ScrollIntoViewOptions): void => {
    seen = 'object' === typeof arg ? arg : undefined;
  };
  el.getBoundingClientRect = (): DOMRect => ({
    x: 0,
    y: 5000,
    left: 0,
    top: 5000,
    right: 100,
    bottom: 5040,
    width: 100,
    height: 40,
    toJSON: () => ({}),
  });
  document.elementFromPoint = () => el;
  return { el, options: () => seen };
}

describe('scrolls Reticle makes for a reading are instant', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('scroll_into_view', async () => {
    const { el, options } = belowTheFold();
    await executeAction(refs.refFor(el), ActionType.SCROLL_INTO_VIEW);
    expect(options()?.behavior).toBe('instant');
  });

  it('the scroll a click makes to reach an off-viewport target', async () => {
    const { el, options } = belowTheFold();
    await executeAction(refs.refFor(el), 'click');
    expect(options()?.behavior).toBe('instant');
    expect(options()?.block).toBe('center');
  });

  it('inspect with reveal', () => {
    const { el, options } = belowTheFold();
    const handler = createCommandRegistry().get(ReticleCommand.INSPECT);
    handler?.({ ref: refs.refFor(el), [INSPECT_REVEAL_ARG]: true });
    expect(options()?.behavior).toBe('instant');
  });
});
