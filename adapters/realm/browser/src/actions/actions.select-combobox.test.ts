import { describe, it, expect, beforeEach } from 'vitest';
import { executeAction } from './actions.js';
import { refs } from '@/dom/addressing/refs.js';

const OPTIONS = ['Apple', 'Banana', 'Cherry'];

/** A Radix-style select: a combobox button that opens a listbox in a portal at the body's end. */
function mountCombobox(opts: { delayed?: boolean } = {}): HTMLButtonElement {
  document.body.innerHTML = '<button role="combobox" aria-expanded="false">Pick</button>';
  const trigger = document.querySelector('button') as HTMLButtonElement;
  const close = (): void => {
    document.querySelector('[role="listbox"]')?.remove();
    trigger.setAttribute('aria-expanded', 'false');
  };
  const open = (): void => {
    const list = document.createElement('div');
    list.setAttribute('role', 'listbox');
    for (const name of OPTIONS) {
      const option = document.createElement('div');
      option.setAttribute('role', 'option');
      option.textContent = name;
      option.addEventListener('click', () => {
        trigger.textContent = name;
        close();
      });
      list.append(option);
    }
    document.body.append(list);
    trigger.setAttribute('aria-expanded', 'true');
  };
  trigger.addEventListener('click', () => {
    if ('true' === trigger.getAttribute('aria-expanded')) {
      close();
    } else if (true === opts.delayed) {
      setTimeout(open, 30);
    } else {
      open();
    }
  });
  return trigger;
}

describe('select on an ARIA combobox', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('opens it and clicks the option with that label', async () => {
    const trigger = mountCombobox();
    await executeAction(refs.refFor(trigger), 'select', { value: 'Banana' });
    expect(trigger.textContent).toBe('Banana');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('waits for a popup that renders after the click', async () => {
    const trigger = mountCombobox({ delayed: true });
    await executeAction(refs.refFor(trigger), 'select', { value: 'Cherry' });
    expect(trigger.textContent).toBe('Cherry');
  });

  it('refuses an unknown value with the available names, and closes what it opened', async () => {
    const trigger = mountCombobox();
    await expect(executeAction(refs.refFor(trigger), 'select', { value: 'Mango' })).rejects.toThrow(
      /no option 'Mango'.*Apple, Banana, Cherry/s,
    );
    expect(trigger.textContent).toBe('Pick');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('refuses a disabled option', async () => {
    const trigger = mountCombobox();
    trigger.addEventListener('click', () => {
      document.querySelectorAll('[role="option"]')[0]?.setAttribute('aria-disabled', 'true');
    });
    await expect(executeAction(refs.refFor(trigger), 'select', { value: 'Apple' })).rejects.toThrow(
      /disabled/,
    );
    expect(trigger.textContent).toBe('Pick');
  });

  it.each([
    ['role="combobox"', '<button role="combobox">Pick</button>'],
    ['aria-haspopup="listbox"', '<button aria-haspopup="listbox">Pick</button>'],
  ])('names the manual path when %s opens no popup', async (_name, html) => {
    document.body.innerHTML = html;
    const button = document.querySelector('button') as HTMLButtonElement;
    await expect(executeAction(refs.refFor(button), 'select', { value: 'a' })).rejects.toThrow(
      /click the combobox.*role.*option.*name/is,
    );
  });

  it('refuses a call with no value', async () => {
    const trigger = mountCombobox();
    await expect(executeAction(refs.refFor(trigger), 'select', {})).rejects.toThrow(/value/);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('keeps the plain refusal for an element that is no combobox', async () => {
    document.body.innerHTML = '<button>Pick</button>';
    const button = document.querySelector('button') as HTMLButtonElement;
    await expect(executeAction(refs.refFor(button), 'select', { value: 'a' })).rejects.toThrow(
      'cannot select on a <button>',
    );
  });
});
