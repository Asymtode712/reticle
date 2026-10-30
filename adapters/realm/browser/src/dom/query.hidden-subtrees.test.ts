import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ElementState } from '@reticlehq/core';
import { matchQuery } from './query.js';

/**
 * A visible-text absence check reads every candidate and must prove that none is visible. On a page
 * of many hidden rich-text or code editors, the hidden DOM is far larger than the visible DOM, and a
 * matcher that reads each hidden node did not answer within its budget. Text under a hidden root
 * cannot be visible, so the matcher must not read it.
 *
 * Asserts a bound, not a duration (a timing assertion fails only under load): the number of style
 * resolutions is the cost the matcher pays for each node it reads.
 */
const EDITORS = 300;
const NODES_PER_EDITOR = 20;
// Finding a hidden ROOT costs a few style reads (five at most). A read for each hidden NODE costs
// twelve thousand here, and this test refuses it.
const STYLE_READ_BOUND = EDITORS * 5;
const NEEDLE = 'unsaved changes warning';

function mountPage(hiddenText: string, visibleText: string): void {
  const editors = Array.from({ length: EDITORS }, () => {
    const lines = Array.from(
      { length: NODES_PER_EDITOR },
      (_unused, line) =>
        `<div class="line"><span>${0 === line ? hiddenText : `line ${line}`}</span></div>`,
    ).join('');
    return `<section class="editor" style="display:none">${lines}</section>`;
  }).join('');
  document.body.innerHTML = `<main><p id="note">${visibleText}</p>${editors}</main>`;
}

let styleReads = 0;

beforeEach(() => {
  document.body.innerHTML = '';
  styleReads = 0;
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
    styleReads += 1;
    return real(el, pseudo);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a visible-text check on a page of hidden editors', () => {
  it('says absent when the text is only inside hidden editors, without reading them', () => {
    mountPage(NEEDLE, 'Profile saved');
    const result = matchQuery({ text: NEEDLE }, ElementState.VISIBLE, undefined, undefined, false);
    expect(result.matched).toBe(false);
    expect(styleReads).toBeLessThan(STYLE_READ_BOUND);
  });

  it('says absent when the text is nowhere, without reading the hidden editors', () => {
    mountPage('plain code', 'Profile saved');
    const result = matchQuery({ text: NEEDLE }, ElementState.VISIBLE, undefined, undefined, false);
    expect(result.matched).toBe(false);
    expect(styleReads).toBeLessThan(STYLE_READ_BOUND);
  });

  it('says absent for a phrase split across elements that is only inside hidden editors', () => {
    mountPage('plain code', 'Profile saved');
    const result = matchQuery(
      { text: 'unsaved changes' },
      ElementState.VISIBLE,
      undefined,
      true,
      false,
    );
    expect(result.matched).toBe(false);
    expect(styleReads).toBeLessThan(STYLE_READ_BOUND);
  });

  it('says present when the text is in the visible paragraph', () => {
    mountPage(NEEDLE, NEEDLE);
    const result = matchQuery({ text: NEEDLE }, ElementState.VISIBLE, undefined, undefined, false);
    expect(result.matched).toBe(true);
    expect(result.count).toBe(1);
    expect(styleReads).toBeLessThan(STYLE_READ_BOUND);
  });

  it('without a state filter, still finds the text inside a hidden editor', () => {
    mountPage(NEEDLE, 'Profile saved');
    const result = matchQuery({ text: NEEDLE });
    expect(result.matched).toBe(true);
  });
});
