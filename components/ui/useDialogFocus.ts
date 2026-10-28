import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Moves focus into a dialog on mount, keeps Tab inside it, and returns focus to the previously focused element on unmount.
 * `initialFocus` is a selector for the element to focus first; otherwise the first focusable element in `bodySelector` (or the panel) gets it.
 */
export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  { initialFocus, bodySelector }: { initialFocus?: string; bodySelector?: string } = {},
) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const trigger = document.activeElement as HTMLElement | null;

    if (!panel.contains(document.activeElement)) {
      const scope = (bodySelector && panel.querySelector<HTMLElement>(bodySelector)) || panel;
      const target =
        (initialFocus && panel.querySelector<HTMLElement>(initialFocus)) ||
        scope.querySelector<HTMLElement>(FOCUSABLE);
      if (target) {
        target.focus();
      } else {
        panel.tabIndex = -1;
        panel.focus();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (trigger && document.contains(trigger)) trigger.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
