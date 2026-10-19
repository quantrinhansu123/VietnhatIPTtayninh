const numericInputSelector = 'input[type="number"]:not([inputmode])';

const addDecimalKeyboardHint = (root: ParentNode | Element) => {
  if (root instanceof HTMLInputElement && root.matches(numericInputSelector)) {
    root.inputMode = 'decimal';
  }

  root.querySelectorAll<HTMLInputElement>(numericInputSelector).forEach(input => {
    input.inputMode = 'decimal';
  });
};

/**
 * Makes every numeric field request a decimal keypad on mobile devices.
 *
 * Existing inputMode declarations are preserved so integer-only fields can
 * continue to request the stricter "numeric" keypad.
 */
export const enableMobileNumericKeyboards = () => {
  addDecimalKeyboardHint(document);

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'attributes') {
        addDecimalKeyboardHint(mutation.target as Element);
        return;
      }

      mutation.addedNodes.forEach(node => {
        if (node instanceof Element) {
          addDecimalKeyboardHint(node);
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    attributeFilter: ['type'],
    attributes: true,
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
};

/**
 * Chặn cuộn chuột khi focus ô `type="number"` — tránh tăng/giảm số ngoài ý muốn
 * (vd. tồn máy / KL định mức trên báo cáo NVL).
 */
export const enableNumberInputWheelGuard = () => {
  const onWheel = (event: WheelEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== 'number') return;
    if (document.activeElement !== target) return;
    event.preventDefault();
  };

  document.addEventListener('wheel', onWheel, { passive: false });
  return () => document.removeEventListener('wheel', onWheel);
};
