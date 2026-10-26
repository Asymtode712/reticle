import type { Page } from 'playwright';
import {
  clampHoldMs,
  DriveErrorCode,
  explicitCodeFromArgs,
  InputModeReason,
  pressKeyFromArgs,
  pressKeysFromArgs,
  pressModifiersFromArgs,
} from '@reticlehq/core';
import { DriveError } from './drive-error.js';
import type { RealInputArgs } from './real-input.js';

type SleepFn = (ms: number) => Promise<void>;

/**
 * Drive a `press` with a real keyboard — coordinate-free; the key goes to whatever holds focus.
 * Key and modifiers come from the same core helpers the synthetic dispatcher uses, so the two paths
 * cannot read the same args differently.
 *
 * A `holdMs` splits the chord into down / wait / up, the same shape the page uses for a held key.
 * `keyboard.press` would send it instantly instead, reporting a hold-to-confirm that never held.
 * The one thing this cannot reproduce is the auto-repeat a held key emits: the driver sends a single
 * keydown, where the in-page path sends the repeats a browser would. Named rather than papered over
 * — an app that counts repeats needs the synthetic path, and a caller that sees a held key do
 * nothing now has a reason to try it.
 */
export async function pressViaKeyboard(
  page: Page,
  args: RealInputArgs,
  sleep: SleepFn,
  now: () => number,
): Promise<number> {
  const key = pressKeyFromArgs(args);
  const modifiers = pressModifiersFromArgs(args);
  const chord = 0 < modifiers.length ? `${modifiers.join('+')}+${key}` : key;
  const holdMs = clampHoldMs(args.holdMs);
  if (0 === holdMs) {
    // `press` DOES take a chord string ("Control+k"), so the tap path needs no splitting.
    await page.keyboard.press(chord);
    return 0;
  }
  /*
   * `down`/`up` take ONE key each, unlike `press`: `down('Control+k')` throws
   * `Unknown key: "Control+k"` — measured on a real Chromium, not assumed. The chord string the
   * tap path uses therefore cannot express a hold, so the chord is split here: modifiers down in
   * chord order, the key last, and released in reverse (key first, modifiers reversed), which is
   * what a hand does and what an app's keyup bookkeeping expects.
   *
   * Without the split a held shortcut threw before a single key moved, the caller fell back to
   * the synthetic path, and a real hold was impossible for any press with modifiers — the exact
   * gesture `holdMs` exists for.
   *
   * ## Why every key that went down is tracked, and every exit path cleans up
   *
   * The down calls are the ones that MOVE the keyboard, and they can fail partway: `Control` goes
   * down, the key after it rejects, and the driver's copy of `Control` is still held. That path
   * used to fall straight to the caller's synthetic replay — which presses the same chord again on
   * a keyboard that is already holding a modifier. Tracking what actually went down is what makes
   * the cleanup below able to release the right keys, and only those: releasing a key that never
   * went down is its own lie, and it would turn a clean failure into an unnecessary refusal.
   */
  const pressed: string[] = [];
  const pressDown = async (k: string): Promise<void> => {
    await page.keyboard.down(k);
    pressed.push(k);
  };
  try {
    for (const modifier of modifiers) {
      await pressDown(modifier);
    }
    await pressDown(key);
  } catch (error) {
    // The chord is PARTIALLY down. Release what is held before reporting the failure; if that
    // cannot be proved, `releaseKeys` throws RELEASE_FAILED and the caller refuses the replay —
    // the same rule as a failed release on the ordinary path, for the same reason. Only when the
    // cleanup DOES succeed is the original error safe to hand back.
    await releaseKeys(page, pressed);
    throw error;
  }
  const startedAt = now();
  try {
    await sleep(holdMs);
  } catch (error) {
    // The wait failed, and the caller is about to run the synthetic path — which presses this SAME
    // key a second time. If the driver's copy stays down, a held modifier then colours every later
    // action for the rest of the run. Best-effort on purpose: whatever went wrong with the wait is
    // the error worth reporting. A cleanup that cannot be proved is the exception — that one is a
    // stuck key, and it must reach the caller as a refusal rather than be swallowed.
    try {
      await releaseKeys(page, pressed);
    } catch {
      throw new DriveError(
        DriveErrorCode.RELEASE_FAILED,
        'the wait failed and the keys it pressed could not be released, so they may still be held',
      );
    }
    throw error;
  }
  // NOT best-effort: on the ordinary path a failed release is a real failure the caller must hear
  // about, and swallowing it would report a press whose key is still down.
  await releaseKeys(page, pressed);
  return now() - startedAt;
}

/**
 * Release the given keys, in reverse press order, and report a failure as one that leaves the
 * keyboard UNKNOWN rather than as an ordinary provider error.
 *
 * Every release is attempted even after one fails: a stuck `Control` is worse than a stuck letter,
 * so a failure on one key must not skip the rest. The first failure is what is thrown, since it is
 * the one that happened first, and it is wrapped in `DriveError` so the caller can tell "this
 * gesture failed" from "this gesture may have left a key down" — the difference between a safe
 * synthetic replay and an unsafe one.
 */
async function releaseKeys(page: Page, pressed: readonly string[]): Promise<void> {
  let failure: unknown;
  for (const k of [...pressed].reverse()) {
    try {
      await page.keyboard.up(k);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== undefined) {
    throw new DriveError(
      DriveErrorCode.RELEASE_FAILED,
      `the key was pressed but could not be released, so it may still be held: ${describeFailure(failure)}`,
    );
  }
}

/**
 * A thrown value as a line a reader can act on.
 *
 * Not `String(error)`: a non-Error thrown value (a rejected plain object, an SDK that throws a
 * record) stringifies to `[object Object]`, which names nothing and hides the one fact the message
 * exists to carry. Anything that is neither an Error nor a string says so rather than pretending.
 */
function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'string' === typeof error ? error : 'an unknown error';
}

/**
 * The `press`es this module will NOT drive: a chord that only the in-page dispatcher can express.
 *
 * `args.keys` asks for several keys held down TOGETHER, pressed in order and released in reverse.
 * That is not a `page.keyboard.press` chord — a non-modifier key cannot appear before the last `+`
 * — and a real keyboard cannot aim a key at a named element. `args.code` is the third: the driver
 * presses by KEY name and offers no way to send a physical `code` that disagrees with it, so
 * `{ text: 'z', code: 'KeyY' }` would strike a different key than the one asked for. All three are
 * routed to the synthetic path by the caller, which reports the reason rather than pretending a
 * different gesture happened.
 *
 * Ordered by how specifically the caller asked: `keys` then `code` name the KEY, `ref` names only
 * the target. Two can apply at once, and the earlier one is the more unusual request — the reason
 * should name that, not the generic "you passed a ref".
 */
export function unspellablePressReason(
  ref: string,
  args: Record<string, unknown>,
): InputModeReason | undefined {
  if (0 < pressKeysFromArgs(args).length) {
    return InputModeReason.SYNTHETIC_MULTI_KEY_PRESS_PREFERRED;
  }
  if (explicitCodeFromArgs(args) !== undefined) {
    return InputModeReason.SYNTHETIC_KEY_CODE_PRESS_PREFERRED;
  }
  if (0 < ref.length) {
    return InputModeReason.SYNTHETIC_ELEMENT_PRESS_PREFERRED;
  }
  return undefined;
}
