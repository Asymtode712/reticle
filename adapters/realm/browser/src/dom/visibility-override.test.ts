import { beforeEach, describe, expect, it } from 'vitest';
import { ElementState } from '@reticlehq/core';
import { isHiddenSubtree, isVisible } from './visibility.js';
import { matchQuery } from './query.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('a visible child under a hidden visibility value', () => {
  it.each(['hidden', 'collapse'])('can override visibility:%s', (visibility) => {
    document.body.innerHTML = `<div style="visibility:${visibility}"><p style="visibility:visible">Saved</p></div>`;
    const parent = document.body.firstElementChild;
    const child = parent?.firstElementChild;
    if (null === parent || null === child || undefined === child) {
      throw new Error('Missing test elements');
    }
    // Resolve the parent first to exercise the cached hidden-subtree shortcut.
    const memo = new Map<Element, boolean>();
    expect(isVisible(parent, memo)).toBe(false);
    expect(isHiddenSubtree(parent, memo)).toBe(false);
    expect(isVisible(child, memo)).toBe(true);
    expect(matchQuery({ text: 'Saved' }, ElementState.VISIBLE).matched).toBe(true);
  });

  it('keeps inherited visibility hidden', () => {
    document.body.innerHTML = '<div style="visibility:hidden"><p>Saved</p></div>';
    const child = document.querySelector('p');
    expect(child !== null && isVisible(child)).toBe(false);
    expect(matchQuery({ text: 'Saved' }, ElementState.VISIBLE).matched).toBe(false);
  });

  it.each([
    '<div style="display:none">',
    '<div hidden>',
    '<div style="opacity:0">',
    '<div aria-hidden="true">',
    '<details><summary>More</summary>',
  ])('cannot override a non-rendering subtree: %s', (opening) => {
    const closing = opening.startsWith('<details') ? '</details>' : '</div>';
    document.body.innerHTML = `${opening}<section style="visibility:hidden"><p style="visibility:visible">Saved</p></section>${closing}`;
    const child = document.querySelector('p');
    expect(child !== null && isVisible(child)).toBe(false);
    expect(matchQuery({ text: 'Saved' }, ElementState.VISIBLE).matched).toBe(false);
  });
});
