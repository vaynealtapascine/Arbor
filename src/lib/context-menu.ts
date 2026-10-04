/** Right-click, keyboard menu key, and touch hold share the same menu. */
export function contextMenu(node: HTMLElement, open: (anchor: DOMRect) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pointer: number | null = null;
  let startX = 0;
  let startY = 0;
  let suppressUntil = 0;

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
    pointer = null;
  }

  function menu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    cancel();
    if (Date.now() < suppressUntil) return;
    open(new DOMRect(e.clientX, e.clientY, 0, 0));
  }

  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' || e.button !== 0 || !e.isPrimary) return;
    cancel();
    // A tag hold must not arm the enclosing item's selection or drag gesture.
    e.stopPropagation();
    pointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      suppressUntil = Date.now() + 800;
      open(node.getBoundingClientRect());
      cancel();
      navigator.vibrate?.(12);
    }, 500);
  }

  function move(e: PointerEvent) {
    if (e.pointerId === pointer && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) cancel();
  }

  function click(e: MouseEvent) {
    if (Date.now() >= suppressUntil) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function key(e: KeyboardEvent) {
    if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
    e.preventDefault();
    e.stopPropagation();
    open(node.getBoundingClientRect());
  }

  node.addEventListener('contextmenu', menu);
  node.addEventListener('pointerdown', down);
  node.addEventListener('click', click, true);
  node.addEventListener('keydown', key);
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', cancel);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  return {
    update(next: typeof open) { open = next; },
    destroy() {
      cancel();
      node.removeEventListener('contextmenu', menu);
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('click', click, true);
      node.removeEventListener('keydown', key);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    },
  };
}
