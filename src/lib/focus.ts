// On phones, moving focus from one text field to one that doesn't exist yet
// (e.g. Enter creating the next row) closes and reopens the keyboard. Parking
// focus on a hidden field inside the same keypress keeps the keyboard up until
// the new editor takes over.
let holder: HTMLTextAreaElement | null = null;

export function keepKeyboard() {
  if (!matchMedia('(pointer: coarse)').matches) return;
  if (!holder) {
    holder = document.createElement('textarea');
    holder.setAttribute('aria-hidden', 'true');
    holder.tabIndex = -1;
    Object.assign(holder.style, {
      position: 'fixed',
      top: '40%',
      left: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      fontSize: '16px',
      pointerEvents: 'none',
    });
    document.body.append(holder);
  }
  holder.focus({ preventScroll: true });
}

/** Places the caret in a textarea: an index, or 'start' / 'end'. */
export function placeCaret(el: HTMLTextAreaElement | HTMLInputElement, caret: number | 'start' | 'end') {
  const n = caret === 'start' ? 0 : caret === 'end' ? el.value.length : Math.min(caret, el.value.length);
  el.setSelectionRange(n, n);
}

/** Scrolls a row into view if it's off-screen (e.g. after adding or moving). */
export function revealRow(id: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-row-id="${id}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
