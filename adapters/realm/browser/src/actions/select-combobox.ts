import { echoRef } from '@/dom/addressing/refs.js';
import { getAccessibleName } from '@/dom/a11y.js';
import { isReticleUi } from '@/dom/dom-ignore.js';
import { isVisible } from '@/dom/visibility.js';
import { nativeFrame } from '@/timers/native/native-timers.js';
import type { ActionTarget } from '@/dom/realm.js';

/** Frames to wait for a popup to render after the click that opens it. */
const OPEN_WAIT_FRAMES = 30;

const ROLE_OPTION = 'option';

/** Clicks an element the way a person would, and says whether the app cancelled the click. */
type ClickFn = (el: ActionTarget) => Promise<{ prevented: boolean }>;

function optionName(option: Element): string {
  return getAccessibleName(option).trim();
}

/** The options a person can see: those in the popup the trigger names, else every open listbox. */
function visibleOptions(trigger: Element): Element[] {
  const doc = trigger.ownerDocument;
  const ids = (trigger.getAttribute('aria-controls') ?? trigger.getAttribute('aria-owns') ?? '')
    .split(/\s+/)
    .filter((id) => 0 < id.length);
  const popups = ids
    .map((id) => doc.getElementById(id))
    .filter((popup): popup is HTMLElement => null !== popup);
  const roots: ParentNode[] = 0 < popups.length ? popups : [doc];
  return roots
    .flatMap((root) => Array.from(root.querySelectorAll(`[role="${ROLE_OPTION}"]`)))
    .filter((option) => !isReticleUi(option) && isVisible(option));
}

async function waitForOptions(trigger: Element): Promise<Element[]> {
  for (let frame = 0; frame < OPEN_WAIT_FRAMES; frame += 1) {
    const options = visibleOptions(trigger);
    if (0 < options.length) {
      return options;
    }
    await nativeFrame();
  }
  return [];
}

function matches(option: Element, wanted: string): boolean {
  const asked = wanted.trim();
  return (
    optionName(option) === asked ||
    option.getAttribute('data-value') === wanted ||
    option.getAttribute('value') === wanted
  );
}

/**
 * `select` on an ARIA combobox: open it, click the option a person would, as the native path does
 * for a `<select>`. A value that matches no option is refused with the names that do exist, and a
 * popup this call opened is closed again so the refusal leaves the page as it found it. When no
 * popup or no option appears at all, the refusal is `noPopupMessage`, which names the manual path.
 */
export async function selectInCombobox(
  trigger: ActionTarget,
  wanted: string,
  click: ClickFn,
  noPopupMessage: string,
): Promise<boolean> {
  const openedHere = 'true' !== trigger.getAttribute('aria-expanded');
  if (openedHere) {
    await click(trigger);
  }
  const options = await waitForOptions(trigger);
  const found = options.filter((option) => matches(option, wanted));
  const [match] = found;
  const problem = 0 === options.length ? noPopupMessage : problemWith(found, options, wanted);
  if (match === undefined || problem !== undefined) {
    if (openedHere) {
      await click(trigger);
    }
    throw new Error(problem ?? 'no option');
  }
  return (await click(match as ActionTarget)).prevented;
}

/** Why the options found cannot be clicked, or undefined when exactly one enabled option matches. */
function problemWith(
  found: readonly Element[],
  options: readonly Element[],
  wanted: string,
): string | undefined {
  const [match] = found;
  if (match === undefined) {
    return `no option '${echoRef(wanted)}' — available: ${options.map(optionName).join(', ')}`;
  }
  if (1 < found.length) {
    return `${found.length} options match '${echoRef(wanted)}' — name one by its exact label`;
  }
  if ('true' === match.getAttribute('aria-disabled')) {
    return `cannot select a disabled option '${echoRef(wanted)}' — a real user could not, so neither will Reticle`;
  }
  return undefined;
}
