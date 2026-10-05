/**
 * Elastic UI marks controls `data-test-subj` and Cypress codebases `data-cy`; the `testid` locator
 * only read `data-testid`, so `{ testid: "pagination-button-next" }` reported "matched no element" on
 * a button that was on screen. A project now names its attribute, and a miss says which one it found.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { QueryBy } from '@reticlehq/core';
import { runQuery } from './query.js';
import { setTestIdAttr, getTestIdAttr } from './testid-attr.js';

const BUTTON = '<button data-test-subj="next">Next</button>';

describe('configurable test-id attribute', () => {
  beforeEach(() => {
    document.body.innerHTML = BUTTON;
  });
  afterEach(() => setTestIdAttr(undefined));

  it('resolves a testid under the configured attribute', () => {
    setTestIdAttr('data-test-subj');
    expect(runQuery({ by: QueryBy.TESTID, value: 'next' }).count).toBe(1);
  });

  it('leaves the default unchanged: data-testid still resolves, other attributes do not', () => {
    document.body.innerHTML = '<button data-testid="a">A</button>' + BUTTON;
    expect(runQuery({ by: QueryBy.TESTID, value: 'a' }).count).toBe(1);
    expect(runQuery({ by: QueryBy.TESTID, value: 'next' }).count).toBe(0);
  });

  it('names the attribute that holds the value when a testid query misses', () => {
    const hint = runQuery({ by: QueryBy.TESTID, value: 'next' }).hint;
    expect(hint?.testidFoundUnder).toBe('data-test-subj');
  });

  it('says nothing extra when the value is not on the page under any attribute', () => {
    expect(runQuery({ by: QueryBy.TESTID, value: 'nope' }).hint?.testidFoundUnder).toBeUndefined();
  });

  it('advertises present testids from the configured attribute', () => {
    setTestIdAttr('data-test-subj');
    document.body.innerHTML = BUTTON;
    expect(runQuery({ by: QueryBy.TESTID, value: 'gone' }).hint?.presentTestids).toEqual(['next']);
  });

  it('ignores a value that is not a plain attribute name', () => {
    setTestIdAttr('x]; drop');
    expect(getTestIdAttr()).toBe('data-testid');
  });
});
