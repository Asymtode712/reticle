import { describe, it, expect } from 'vitest';
import { ActionType } from './constants/constants.js';
import { ClickButton, clickButtonFromArgs, clickInputProblem } from './click-input.js';

describe('clickButtonFromArgs', () => {
  it('defaults to the left button', () => {
    expect(clickButtonFromArgs({})).toBe(ClickButton.LEFT);
  });
  it('reads left, middle and right, ignoring case', () => {
    expect(clickButtonFromArgs({ button: 'right' })).toBe(ClickButton.RIGHT);
    expect(clickButtonFromArgs({ button: 'Middle' })).toBe(ClickButton.MIDDLE);
  });
  it('returns undefined for a name it does not know', () => {
    expect(clickButtonFromArgs({ button: 'back' })).toBeUndefined();
  });
});

describe('clickInputProblem', () => {
  it('accepts a click with known modifiers and a known button', () => {
    expect(
      clickInputProblem(ActionType.CLICK, { modifiers: ['Shift', 'cmd'], button: 'right' }),
    ).toBeUndefined();
  });
  it('refuses a button it does not know', () => {
    expect(clickInputProblem(ActionType.CLICK, { button: 'back' })).toMatch(/button/);
  });
  it('refuses a modifier it does not know', () => {
    expect(clickInputProblem(ActionType.CLICK, { modifiers: ['Hyper'] })).toMatch(/Hyper/);
  });
  it('refuses a double click with a button other than left', () => {
    expect(clickInputProblem(ActionType.DBLCLICK, { button: 'right' })).toMatch(/dblclick/);
  });
});
