import { describe, it, expect, beforeEach } from 'vitest';
import { executeAction } from './actions.js';
import { refs } from '@/dom/addressing/refs.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

function refOf(html: string): string {
  document.body.innerHTML = html;
  const el = document.body.firstElementChild;
  if (null === el) {
    throw new Error('no element');
  }
  return refs.refFor(el);
}

describe('select on an ARIA combobox names the path that works', () => {
  it.each([
    ['role="combobox"', '<button role="combobox">Pick</button>'],
    ['aria-haspopup="listbox"', '<button aria-haspopup="listbox">Pick</button>'],
  ])('refuses a button with %s and says: click it, then click the option', async (_name, html) => {
    const ref = refOf(html);
    await expect(executeAction(ref, 'select', { value: 'a' })).rejects.toThrow(
      /click the combobox.*role.*option.*name/is,
    );
  });

  it('keeps the plain refusal for an element that is no combobox', async () => {
    const ref = refOf('<button>Pick</button>');
    const failure = await executeAction(ref, 'select', { value: 'a' }).catch((e: Error) => e);
    expect((failure as Error).message).toBe('cannot select on a <button>');
  });
});
