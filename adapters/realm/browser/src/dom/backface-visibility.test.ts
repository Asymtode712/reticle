/**
 * A flip card reports the visible face's controls as `hidden` (#1940).
 *
 * `transform: rotateY(180deg)` on the card, `backface-visibility: hidden` on each face, and the
 * face that is turned toward the viewer is the one a person can use. `isVisible` saw only CSS
 * hiding and clipping, so every element under `backface-visibility: hidden` read `visible` — even
 * the face turned away — and the face turned toward the viewer stayed `hidden` whenever an earlier
 * check had already called it. The browser decides this from the accumulated 3D transform, not
 * from the element's own `backface-visibility` alone.
 *
 * jsdom has no `DOMMatrix`, so the matrix arithmetic runs against a small stand-in. The computed
 * `transform` in a browser is already a `matrix3d(...)` string, which is what these fixtures write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isVisible } from './visibility.js';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major `matrix3d`, matching DOMMatrix's indexing: `m33` is cells[10]. */
class Matrix3d {
  readonly m33: number;
  private readonly cells: number[];

  constructor(init?: string | number[]) {
    this.cells = 'string' === typeof init ? Matrix3d.parse(init) : (init ?? IDENTITY);
    this.m33 = this.cells[10] ?? 1;
  }

  multiply(other: Matrix3d): Matrix3d {
    const cells = new Array<number>(16).fill(0);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        let sum = 0;
        for (let index = 0; index < 4; index += 1) {
          sum += (this.cells[index * 4 + row] ?? 0) * (other.cells[column * 4 + index] ?? 0);
        }
        cells[column * 4 + row] = sum;
      }
    }
    return new Matrix3d(cells);
  }

  private static parse(value: string): number[] {
    const matrix3d = /^matrix3d\(([^)]*)\)$/.exec(value);
    if (null !== matrix3d) {
      return (matrix3d[1] ?? '').split(',').map(Number);
    }
    const matrix = /^matrix\(([^)]*)\)$/.exec(value);
    if (null !== matrix) {
      const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = (matrix[1] ?? '').split(',').map(Number);
      return [a, b, 0, 0, c, d, 0, 0, 0, 0, 1, 0, e, f, 0, 1];
    }
    throw new Error(`unsupported transform: ${value}`);
  }
}

/** The resolved computed value a browser produces for `rotateY(...)`. */
function rotateY(degrees: number): string {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return `matrix3d(${String(cos)},0,${String(sin)},0, 0,1,0,0, ${String(-sin)},0,${String(cos)},0, 0,0,0,1)`;
}

function rotateZ(degrees: number): string {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return `matrix3d(${String(cos)},${String(sin)},0,0, ${String(-sin)},${String(cos)},0,0, 0,0,1,0, 0,0,0,1)`;
}

interface Card {
  readonly front: HTMLElement;
  readonly back: HTMLElement;
  readonly frontControl: HTMLElement;
  readonly backControl: HTMLElement;
}

function mountCard(cardTransform: string, faceBackface: string = 'hidden'): Card {
  const card = document.createElement('div');
  card.style.transform = cardTransform;
  card.style.transformStyle = 'preserve-3d';

  const front = document.createElement('div');
  front.style.backfaceVisibility = faceBackface;
  front.style.transform = rotateY(0);
  const frontControl = document.createElement('button');
  frontControl.textContent = 'Pay now';
  front.append(frontControl);

  const back = document.createElement('div');
  back.style.backfaceVisibility = faceBackface;
  back.style.transform = rotateY(180);
  const backControl = document.createElement('button');
  backControl.textContent = 'Show QR';
  back.append(backControl);

  card.append(front, back);
  document.body.append(card);
  return { front, back, frontControl, backControl };
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('DOMMatrix', Matrix3d);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a flip card with backface-visibility: hidden', () => {
  it('shows the front controls and hides the back before the flip', () => {
    const { frontControl, backControl } = mountCard(rotateY(0));

    expect(isVisible(frontControl)).toBe(true);
    expect(isVisible(backControl)).toBe(false);
  });

  it('shows the back controls and hides the front after the flip', () => {
    const { frontControl, backControl } = mountCard(rotateY(180));

    expect(isVisible(frontControl)).toBe(false);
    expect(isVisible(backControl)).toBe(true);
  });

  it('judges the visible face, not every element that declares backface-visibility: hidden', () => {
    const card = mountCard(rotateY(0));

    // The front face declares `backface-visibility: hidden` and is the face toward the viewer.
    expect(isVisible(card.front)).toBe(true);
    expect(isVisible(card.back)).toBe(false);

    card.front.style.transform = rotateZ(180);
    // A rotation about Z never turns the face away, whatever backface-visibility says.
    expect(isVisible(card.front)).toBe(true);
  });

  it('leaves a rotated face visible when it does not declare backface-visibility: hidden', () => {
    const { frontControl, backControl } = mountCard(rotateY(0), 'visible');

    expect(isVisible(frontControl)).toBe(true);
    expect(isVisible(backControl)).toBe(true);
  });
});
