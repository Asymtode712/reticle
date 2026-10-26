import { ActionType } from './constants/constants.js';
import { pressModifiersFromArgs } from './global-press.js';

/** The pointer buttons a click can use, as the agent spells them in `args.button`. */
export const ClickButton = {
  LEFT: 'left',
  MIDDLE: 'middle',
  RIGHT: 'right',
} as const;
export type ClickButton = (typeof ClickButton)[keyof typeof ClickButton];

const CLICK_BUTTON_NAMES: readonly string[] = Object.values(ClickButton);

/** The button a click asks for: left when `args.button` is absent, undefined when it is unknown. */
export function clickButtonFromArgs(args: Record<string, unknown>): ClickButton | undefined {
  const raw = args['button'];
  if (raw === undefined) {
    return ClickButton.LEFT;
  }
  if ('string' !== typeof raw) {
    return undefined;
  }
  const name = raw.toLowerCase();
  return CLICK_BUTTON_NAMES.find((known) => known === name) as ClickButton | undefined;
}

/**
 * Why a click or dblclick cannot be driven as asked, or undefined when it can. The page and the
 * server both refuse with this sentence, so an argument is never dropped without a word.
 */
export function clickInputProblem(
  action: ActionType,
  args: Record<string, unknown>,
): string | undefined {
  const button = clickButtonFromArgs(args);
  if (button === undefined) {
    return `unsupported click button ${JSON.stringify(args['button'])}: use ${CLICK_BUTTON_NAMES.join(', ')}`;
  }
  if (action === ActionType.DBLCLICK && button !== ClickButton.LEFT) {
    return 'a dblclick uses the left button only: a browser sends no dblclick for another button';
  }
  const raw = args['modifiers'];
  if (Array.isArray(raw)) {
    const unknown = raw.filter(
      (item) => 0 === pressModifiersFromArgs({ modifiers: [item] }).length,
    );
    if (0 < unknown.length) {
      return `unsupported click modifier ${JSON.stringify(unknown[0])}: use Meta, Control, Shift or Alt`;
    }
  }
  return undefined;
}
